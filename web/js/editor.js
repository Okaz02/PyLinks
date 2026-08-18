import { blocksData } from '../block/blocks.js';
import { createElement } from './parser.js';

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

const blockTemplate = document.getElementById("block-template");
const controlBlockTemplate = document.getElementById("control-block-template");

const toolsBox = document.getElementById("tools-box");
const toolsBoxInput = document.getElementById("tools-box-input");
const toolsBoxBody = document.getElementById("tools-box-body");

// フォーカスされたaddBlockBtnを追跡
let focusedAddBlockBtn = null;

// 関数をブロックデータに変換
function createFunctionBlockData(moduleName, functionName) {
    return {
        type: "block",
        block_label: functionName,
        block_tag: "function_call",
        block_color: "#3498db",
        block_slide: [
            { type: "label", text: `${functionName}(${moduleName})` }
        ],
        block_back: []
    };
}

function addFunctionBlock(moduleName, functionName) {
    const blockData = createFunctionBlockData(moduleName, functionName);
    const created = createBlock(blockData);
    console.log(focusedAddBlockBtn)

    if (created) {
        if (focusedAddBlockBtn) {
            focusedAddBlockBtn.parentNode.insertBefore(created, focusedAddBlockBtn);
        } else {
            document.body.appendChild(created);
        }
    }
}

function createBlock(blockData) {
    const fragment = blockTemplate.content.cloneNode(true);
    const block = fragment.querySelector(".block");
    const color = block.querySelector(".block-color");
    const slide = block.querySelector(".block-slide");

    const blockSlide = blockData.block_slide ?? [];
    const blockBack = blockData.block_back ?? [];

    color.style.backgroundColor = blockData.block_color;

    blockSlide.forEach(element => {
        const created = createElement(element);

        if (created) {
            slide.appendChild(created);
        }
    });

    blockBack.forEach(element => {
        const created = createElement(element);

        if (created) {
            block.appendChild(created);
        }
    });

    return fragment;
}

function createControlBlock(blockData) {
    const fragment = controlBlockTemplate.content.cloneNode(true);
    const control = fragment.querySelector(".control-block");
    const color = control.querySelector(".control-block-color");
    const header = control.querySelector(".control-block-header-content");
    const body = control.querySelector(".control-block-body-content");

    const blockSlide = blockData.block_slide ?? [];
    const blockBody = blockData.block_body ?? [];
    const blockBack = blockData.block_back ?? [];

    color.style.backgroundColor = blockData.block_color;

    blockSlide.forEach(element => {
        const created = createElement(element);

        if (created) {
            header.appendChild(created);
        }
    });

    blockBody.forEach(element => {
        const created = element.type === "control"
            ? createControlBlock(element)
            : createBlock(element);

        if (created) {
            body.appendChild(created);
        }
    });

    blockBack.forEach(element => {
        const created = createElement(element);

        if (created) {
            header.appendChild(created);
        }
    });

    return fragment;
}

blocksData.blocks.forEach(element => {
    const created = element.type === "control"
        ? createControlBlock(element)
        : createBlock(element);

    if (created) {
        document.body.prepend(created);
    }
});

document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const x = event.clientX;
    const y = event.clientY;
    toolsBox.style.top = `${y}px`;
    toolsBox.style.left = `${x}px`;
});

const addBlockBtns = document.querySelectorAll('[data-system="add-block"]');
addBlockBtns.forEach(element => {
    element.onChangeValue?.((payload, eventName) => {
        if (payload.kind === "state") {
            if (eventName === "released") {
                focusedAddBlockBtn = element;
            }
        }

        if (eventName !== "released") return;
        if (payload.kind !== "state") return;
        const x = event.clientX;
        const y = event.clientY;
        toolsBox.style.top = `${y}px`;
        toolsBox.style.left = `${x}px`;
    });
});

toolsBoxInput.addEventListener("input", async () => {
    if (!pywebviewReady) return;

    const moduleInputs = document.querySelectorAll('[data-system="import_module"]');
    const moduleNames = Array.from(moduleInputs)
        .map(input => input.getValue().value)
        .filter(Boolean);

    const functions = await pywebview.api.search_functions(["builtins", ...moduleNames], toolsBoxInput.value);

    toolsBoxBody.innerHTML = "";

    Object.entries(functions).forEach(([moduleName, arr]) => {
        const details = document.createElement("details");
        details.className = "tools-box-group";

        const summary = document.createElement("summary");
        summary.textContent = `${moduleName} (${arr.length})`;
        details.appendChild(summary);

        arr.forEach(element => {
            const functionLabel = document.createElement("p");
            functionLabel.className = "tools-box-function";
            functionLabel.textContent = element;

            functionLabel.addEventListener("click", () => {
                addFunctionBlock(moduleName, element);
                toolsBoxBody.innerHTML = "";
            });

            details.appendChild(functionLabel);
        });

        toolsBoxBody.appendChild(details);
    });
})