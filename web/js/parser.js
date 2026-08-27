const inputTemplate = document.getElementById("input-template");
const addBtnTemplate = document.getElementById("add-btn-template");
const addBlockBtnTemplate = document.getElementById("add-block-btn-template");
const deleteBtnTemplate = document.getElementById("delete-btn-template");

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

function createWatcher(element) {
    let currentState = 'idle';
    let listeners = [];

    const setState = (state) => {
        if (state === currentState) return;
        currentState = state;
        listeners.forEach(callback => callback(state));
    };

    element.addEventListener('pointerenter', () => setState('hover'));
    element.addEventListener('pointerdown', () => setState('pressing'));
    element.addEventListener('pointerup', () => setState('focused'));
    element.addEventListener('pointerleave', () => {
        if (currentState !== 'focused') setState('idle');
    });

    return {
        getState: () => currentState,
        onChangeValue: (callback) => { listeners.push(callback); },
    };
}

function createLabelElement(element) {
    const label = document.createElement("p");
    label.textContent = element.text;
    label.className = "block-label";

    return label;
}

let measureCtx = null;
function getTextOffsetAtX(inputEl, clientX) {
    measureCtx ??= document.createElement("canvas").getContext("2d");
    const style = getComputedStyle(inputEl);
    measureCtx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    const rect = inputEl.getBoundingClientRect();
    const x = clientX - rect.left - (parseFloat(style.paddingLeft) || 0) + inputEl.scrollLeft;

    const text = inputEl.value;
    let widthSoFar = 0;
    for (let i = 0; i < text.length; i++) {
        const charWidth = measureCtx.measureText(text[i]).width;
        if (widthSoFar + charWidth / 2 > x) return i;
        widthSoFar += charWidth;
    }
    return text.length;
}

function createTextInputElement(element) {
    const container = document.createElement("div");
    container.className = "input-text-container";

    const listeners = [];
    const notify = (eventName) => listeners.forEach(cb => cb(container.getValue(), eventName));
    const getSegments = () => Array.from(container.children).filter(el => el.classList.contains("segment-input"));
    const focusSegment = (input, pos) => {
        input.focus();
        input.setSelectionRange(pos, pos);
    };

    // チップが1つでも入っている間はplaceholderを隠す。
    // チップが1つも残らなくなったら(必ずsegmentは1つに戻るので)元に戻す
    const originalPlaceholder = element.placeholder ?? "";
    const syncPlaceholder = () => {
        const hasChip = Array.from(container.children).some(el => el.classList.contains("function-chip"));
        const placeholder = hasChip ? "" : originalPlaceholder;
        getSegments().forEach(input => { input.placeholder = placeholder; });
    };

    const mergeAcrossChip = (prevInput, chip, nextInput) => {
        const mergedPos = prevInput.value.length;
        prevInput.value += nextInput.value;
        chip.remove();
        nextInput.remove();
        focusSegment(prevInput, mergedPos);
        syncPlaceholder();
        notify("input");
    };

    const handleSegmentKeydown = (e, input) => {
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
        const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

        if (e.key === "ArrowLeft" && atStart) {
            const prevChip = input.previousElementSibling;
            const prevInput = prevChip?.previousElementSibling;
            if (prevChip?.classList.contains("function-chip") && prevInput) {
                e.preventDefault();
                focusSegment(prevInput, prevInput.value.length);
            }
        } else if (e.key === "ArrowRight" && atEnd) {
            const nextChip = input.nextElementSibling;
            const nextInput = nextChip?.nextElementSibling;
            if (nextChip?.classList.contains("function-chip") && nextInput) {
                e.preventDefault();
                focusSegment(nextInput, 0);
            }
        } else if (e.key === "Backspace" && atStart) {
            const prevChip = input.previousElementSibling;
            const prevInput = prevChip?.previousElementSibling;
            if (prevChip?.classList.contains("function-chip") && prevInput) {
                e.preventDefault();
                mergeAcrossChip(prevInput, prevChip, input);
            }
        } else if (e.key === "Delete" && atEnd) {
            const nextChip = input.nextElementSibling;
            const nextInput = nextChip?.nextElementSibling;
            if (nextChip?.classList.contains("function-chip") && nextInput) {
                e.preventDefault();
                mergeAcrossChip(input, nextChip, nextInput);
            }
        }
    };

    const createSegment = (value = "", placeholder) => {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "segment-input";
        input.value = value;
        if (placeholder) input.placeholder = placeholder;
        input.addEventListener("input", () => notify("input"));
        input.addEventListener("keydown", (e) => handleSegmentKeydown(e, input));
        return input;
    };

    container.appendChild(createSegment("", element.placeholder));

    container.getValue = () => ({ kind: "text", value: getSegments().map(input => input.value).join("") });
    container.onChangeValue = (callback) => { listeners.push(callback); };
    container.addEventListener("focusout", (e) => {
        if (!container.contains(e.relatedTarget)) notify("blur");
    });

    container.insertChip = (chipElement, segment, offset) => {
        const segments = getSegments();
        const target = (segment && container.contains(segment)) ? segment : segments[segments.length - 1];

        if (!target) {
            container.appendChild(chipElement);
        } else {
            const pos = Math.min(Math.max(offset ?? target.value.length, 0), target.value.length);
            const tail = createSegment(target.value.slice(pos));
            target.value = target.value.slice(0, pos);
            target.after(chipElement, tail);
        }
        syncPlaceholder();
        notify("input");
    };

    if (element.system) {
        container.dataset.system = element.system;
    }

    const isDropOnChipDecoration = (e) => {
        const chip = e.target.closest?.(".function-chip");
        return !!chip && container.contains(chip);
    };

    const distanceToX = (el, x) => {
        const r = el.getBoundingClientRect();
        return x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    };
    const findNearestSegment = (x, y) => {
        const segments = getSegments();
        if (segments.length === 0) return null;
        const sameRow = segments.filter(el => {
            const r = el.getBoundingClientRect();
            return y >= r.top && y <= r.bottom;
        });
        const candidates = sameRow.length ? sameRow : segments;
        return candidates.reduce((closest, el) => distanceToX(el, x) < distanceToX(closest, x) ? el : closest);
    };

    container.addEventListener("mousedown", (e) => {
        if (e.target.classList.contains("segment-input") || isDropOnChipDecoration(e)) return;
        const target = findNearestSegment(e.clientX, e.clientY);
        if (!target) return;
        e.preventDefault();
        focusSegment(target, getTextOffsetAtX(target, e.clientX));
    });

    container.addEventListener("dragover", (e) => {
        if (isDropOnChipDecoration(e)) return;
        e.preventDefault();
        e.stopPropagation();
        container.classList.add("dragover");
    });
    container.addEventListener("dragleave", (e) => {
        if (!container.contains(e.relatedTarget)) container.classList.remove("dragover");
    });
    container.addEventListener("drop", (e) => {
        if (isDropOnChipDecoration(e)) return;
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove("dragover");

        const data = e.dataTransfer.getData("application/json");
        if (!data) return;
        const parsed = JSON.parse(data);

        const target = e.target.classList?.contains("segment-input") ? e.target : findNearestSegment(e.clientX, e.clientY);
        const offset = target ? getTextOffsetAtX(target, e.clientX) : 0;

        if (parsed.kind === "block") {
            window.addStaticBlockToInput(parsed.blockData, container, target, offset);
        } else {
            window.addFunctionBlockToInput(parsed.moduleName, parsed.functionName, container, target, offset);
        }
    });

    return container;
}

function createInputElement(element) {
    switch (element.input_type) {
        case "text":
            return createTextInputElement(element);
    }
}

function createButtonAddElement(element) {
    const addFragment = addBtnTemplate.content.cloneNode(true);
    const addBtn = addFragment.querySelector(".btn-add");

    addBtn.addEventListener("click", () => {
        element.target.forEach(target => {
            const created = createElement(target);

            if (created) {
                addBtn.parentNode.insertBefore(created, addBtn);
            }
        });
    });
    const watcher = createWatcher(addBtn);
    addBtn.getValue = () => ({ kind: "state", value: watcher.getState() });
    addBtn.onChangeValue = (callback) => {
        watcher.onChangeValue(state => callback(addBtn.getValue(), state));
    };

    if (element.system) {
        addBtn.dataset.system = element.system;
    }

    return addBtn;
}

function createButtonDeleteElement(element) {
    const deleteElement = document.createElement("div");
    deleteElement.className = "delete";

    element.target.forEach(target => {
        const created = createElement(target);

        if (created) {
            deleteElement.appendChild(created);
        }
    });

    const deleteFragment = deleteBtnTemplate.content.cloneNode(true);
    const deleteBtn = deleteFragment.querySelector(".delete-btn");

    deleteBtn.addEventListener("click", () => {
        deleteElement.remove();
    });

    deleteElement.appendChild(deleteBtn);

    const watcher = createWatcher(deleteBtn);
    deleteElement.getValue = () => ({ kind: "state", value: watcher.getState() });
    deleteElement.onChangeValue = (callback) => {
        watcher.onChangeValue(state => callback(deleteElement.getValue(), state));
    };

    if (element.system) {
        deleteElement.dataset.system = element.system;
    }

    return deleteElement;
}

async function runCheckLogic(checkName, payload) {
    if (!pywebviewReady) return false;

    switch (checkName) {
        case "import_module":
            if (payload.kind !== "text") {
                console.error(`${payload.kind} is non-supported Kind`);
                return false;
            }
            return pywebview.api.check_module_exists(payload.value);
        default:
            console.error(`${checkName} is non-supported CheckName`);
            return false;
    }
}

class CheckedElement {
    constructor(element) {
        this.element = element;
        this.warpEl = createElement(element.warp);
        this.node = this.#build();
    }

    #build() {
        const wrapper = document.createElement("div");
        wrapper.className = "checked-block";

        if (this.warpEl) {
            wrapper.appendChild(this.warpEl);
            this.warpEl.onChangeValue?.((payload, eventName) => {
                if (this.element.when !== eventName) return;
                this.runCheck(payload);
            });
        }

        return wrapper;
    }

    async runCheck(payload = this.warpEl?.getValue?.() ?? null) {
        const ok = await runCheckLogic(this.element.check, payload);
        this.#renderResult(ok ? this.element.on_success : this.element.on_fail);
    }

    #renderResult(targets = []) {
        this.node.querySelectorAll(".checked-result").forEach(el => el.remove());
        targets.forEach(t => {
            const created = createElement(t);
            if (created) {
                created.classList.add("checked-result");
                this.node.appendChild(created);
            }
        });
    }

    getValue() {
        return this.warpEl?.getValue?.() ?? null;
    }
}

function createElement(element) {
    switch (element.type) {
        case "label":
            return createLabelElement(element);
        case "input":
            return createInputElement(element);
        case "button":
            switch (element.action) {
                case "add":
                    return createButtonAddElement(element);
                case "delete":
                    return createButtonDeleteElement(element);
                default:
                    console.error(`${element.action} is non-supported type`);
                    return null;
            }
        case "checked":
            const instance = new CheckedElement(element);
            instance.runCheck();
            return instance.node;
        default:
            console.error(`${element.type} is non-existent type`);
            return null;
    }
}

export { createElement };