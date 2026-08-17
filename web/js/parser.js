const input_template = document.getElementById("input-template");
const add_btn_template = document.getElementById("add-btn-template");
const delete_btn_template = document.getElementById("delete-btn-template");

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

function create_watcher(element) {
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

function gen_label_element(element) {
    const label = document.createElement("p");
    label.textContent = element.text;
    label.className = "block-label";

    return label;
}
function gen_input_element(element) {
    if (element.input_type !== "text") {
        console.error(`${element.input_type} is non-supported InputType`);
    };

    const input_fragment = input_template.content.cloneNode(true);
    const input = input_fragment.querySelector(".input-field");

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
}
function gen_button_add_element(element) {
    const add_fragment = add_btn_template.content.cloneNode(true);
    const add_button = add_fragment.querySelector(".btn-add");

    add_button.addEventListener("click", () => {
        element.target.forEach(target => {
            const created = create_element(target);

            if (created) {
                add_button.before(created);
            }
        });
    });
    const watcher = create_watcher(add_button);
    add_button.getValue = () => ({ kind: "state", value: watcher.getState() });
    add_button.onChangeValue = (callback) => {
        watcher.onChangeValue(state => callback(add_button.getValue(), state));
    };

    if (element.system) {
        add_button.dataset.system = element.system;
    }

    return add_button;
}
function gen_button_delete_element(element) {
    const delete_element = document.createElement("div");
    delete_element.className = "delete";

    element.target.forEach(target => {
        const created = create_element(target);

        if (created) {
            delete_element.appendChild(created);
        }
    });

    const delete_fragment = delete_btn_template.content.cloneNode(true);
    const delete_button = delete_fragment.querySelector(".delete-btn");

    delete_button.addEventListener("click", () => {
        delete_element.remove();
    });


    delete_element.appendChild(delete_button);

    const watcher = create_watcher(delete_button);
    delete_element.getValue = () => ({ kind: "state", value: watcher.getState() });
    delete_element.onChangeValue = (callback) => {
        watcher.onChangeValue(state => callback(delete_element.getValue(), state));
    };

    if (element.system) {
        delete_element.dataset.system = element.system;
    }

    return delete_element;
}

async function runCheckLogic(checkName, payload) {
    if (!pywebviewReady) return false;

    switch (checkName) {
        case "import_module":
            if (payload.kind !== "text") {
                console.error(`${payload.kind} is non-supported Kind`);
            };
            return pywebview.api.check_module_exists(payload.value);
        default:
            console.error(`${checkName} is non-supported CheckName`);
            return false;
    }
}

class CheckedElement {
    constructor(element) {
        this.element = element;
        this.warpEl = create_element(element.warp);
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
            const created = create_element(t);
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

function create_element(element) {
    switch (element.type) {
        case "label":
            return gen_label_element(element);
            break;

        case "input":
            return gen_input_element(element);
            break;

        case "button":
            switch (element.action) {
                case "add":
                    return gen_button_add_element(element);
                    break;

                case "delete":
                    return gen_button_delete_element(element);
                    break;

                default:
                    console.error(`${element.action} is non-supported type`);
                    return;
                    break;
            }
            break;

        case "checked":
            const instance = new CheckedElement(element);
            instance.runCheck();
            return instance.node;
            break;

        default:
            console.error(`${element.type} is non-existent type`);
            return null;
            break;
    }
}
export { create_element };