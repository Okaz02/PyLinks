import { blocksData } from '../block/blocks.js';
import { create_element } from './parser.js';

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

const block_template = document.getElementById("block-template");
const control_block_template = document.getElementById("control-block-template");

const toolsBox = document.getElementById("tools-box");
const toolsBox_input = document.getElementById("tools-box-input");
const toolsBox_body = document.getElementById("tools-box-body");

function create_block(block_data) {
    const fragment = block_template.content.cloneNode(true);
    const block = fragment.querySelector(".block");
    const color = block.querySelector(".block-color");
    const slide = block.querySelector(".block-slide");

    const block_slide = block_data.block_slide ?? [];
    const block_back = block_data.block_back ?? [];

    color.style.backgroundColor = block_data.block_color;

    block_slide.forEach(element => {
        const created = create_element(element);

        if (created) {
            slide.appendChild(created);
        }
    });

    block_back.forEach(element => {
        const created = create_element(element);

        if (created) {
            block.appendChild(created);
        }
    });

    return fragment;
}

function create_control_block(block_data) {
    const fragment = control_block_template.content.cloneNode(true);
    const control = fragment.querySelector(".control-block");
    const color = control.querySelector(".control-block-color");
    const header = control.querySelector(".control-block-header-content");
    const body = control.querySelector(".control-block-body-content");

    const block_slide = block_data.block_slide ?? [];
    const block_body = block_data.block_body ?? [];
    const block_back = block_data.block_back ?? [];

    color.style.backgroundColor = block_data.block_color;

    block_slide.forEach(element => {
        const created = create_element(element);

        if (created) {
            header.appendChild(created);
        }
    });

    block_body.forEach(element => {
        const created = element.type === "control"
            ? create_control_block(element)
            : create_block(element);

        if (created) {
            body.appendChild(created);
        }
    });

    block_back.forEach(element => {
        const created = create_element(element);

        if (created) {
            header.appendChild(created);
        }
    });

    return fragment;
}

blocksData.blocks.forEach(element => {
    const created = element.type === "control"
        ? create_control_block(element)
        : create_block(element);

    if (created) {
        document.body.prepend(created);
    }
});

document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const x = event.clientX;
    const y = event.clientY;
    toolsBox.style.top = `${y}px`
    toolsBox.style.left = `${x}px`

});

toolsBox_input.addEventListener("input", async () => {
    if (!pywebviewReady) return;

    const moduleInputs = document.querySelectorAll('[data-system="import_module"]');
    const moduleNames = Array.from(moduleInputs)
        .map(input => input.getValue().value)
        .filter(Boolean);

    const functions = await pywebview.api.search_functions(["builtins", ...moduleNames], toolsBox_input.value);

    toolsBox_body.innerHTML = "";

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
            details.appendChild(functionLabel);
        });

        toolsBox_body.appendChild(details);
    });
})