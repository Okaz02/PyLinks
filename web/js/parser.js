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
    element.addEventListener('pointerup', () => setState('released'));
    element.addEventListener('pointerleave', () => setState('idle'));

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

function createInputElement(element) {
    switch (element.input_type) {
        case "text":
            const inputFragment = inputTemplate.content.cloneNode(true);
            const input = inputFragment.querySelector(".input-field");

            input.getValue = () => ({ kind: "text", value: input.value });
            input.onChangeValue = (callback) => {
                ["input", "blur", "change"].forEach(eventName => {
                    input.addEventListener(eventName, () => callback(input.getValue(), eventName));
                });
            };

            if (element.system) {
                input.dataset.system = element.system;
            }

            return input;
        case "block":
            const addBlockBtnFragment = addBlockBtnTemplate.content.cloneNode(true);
            const addBlockBtn = addBlockBtnFragment.querySelector(".add-block-btn");

            const watcher = createWatcher(addBlockBtn);
            addBlockBtn.getValue = () => ({ kind: "state", value: watcher.getState() });
            addBlockBtn.onChangeValue = (callback) => {
                watcher.onChangeValue(state => callback(addBlockBtn.getValue(), state));
            };

            if (element.system) {
                addBlockBtn.dataset.system = element.system;
            }

            return addBlockBtnFragment;
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