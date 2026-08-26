import { blocksData } from '../block/blocks.js';
import { createElement } from './parser.js';

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

const blockTemplate = document.getElementById("block-template");
const controlBlockTemplate = document.getElementById("control-block-template");

const toolsBox = document.getElementById("tools-box");
const toolsBoxInput = document.getElementById("tools-box-input");
const toolsBoxBody = document.getElementById("tools-box-body");

function createFunctionBlockData(moduleName, functionName, params = []) {
    let labelName = "";
    if (moduleName === "builtins") {
        labelName = `${functionName}(`
    } else {
        labelName = `${moduleName}${functionName}(`;
    }
    const blockSlide = [
        { type: "label", text: labelName }
    ];

    params.forEach((param, index) => {
        if (index > 0) {
            blockSlide.push({ type: "label", text: "," });
        }
        blockSlide.push({
            type: "input",
            input_type: "text"
        });
    });

    blockSlide.push({ type: "label", text: `)` })

    return {
        type: "block",
        block_module: moduleName,
        block_label: functionName,
        block_tag: "function_call",
        block_color: "#3498db",
        block_slide: blockSlide,
        block_back: []
    };
}

// トップレベルのブロックのうち、指定Y座標より下にある最初の要素を返す
// （ドロップした高さに応じて、縦積みの並びの中の適切な位置に挿入するため）
function getTopLevelBlockBelow(y) {
    const topLevelBlocks = Array.from(document.body.children).filter(el =>
        el.classList.contains("block") || el.classList.contains("control-block")
    );
    return topLevelBlocks.find(el => el.getBoundingClientRect().top > y) || null;
}

async function addFunctionBlock(moduleName, functionName, dropY) {
    // シグネチャ情報を取得
    if (!pywebviewReady) return;
    const sig = await pywebview.api.get_function_signature(moduleName, functionName);
    const params = sig.params || [];

    const blockData = createFunctionBlockData(moduleName, functionName, params);
    const created = createBlock(blockData);

    if (created) {
        const ref = typeof dropY === "number" ? getTopLevelBlockBelow(dropY) : null;
        document.body.insertBefore(created, ref);
    }
}

async function addFunctionBlockToInput(moduleName, functionName, container, segment, offset) {
    // シグネチャ情報を取得
    if (!pywebviewReady) return;
    const sig = await pywebview.api.get_function_signature(moduleName, functionName);
    const params = sig.params || [];

    const blockData = createFunctionBlockData(moduleName, functionName, params);
    const created = createBlock(blockData);

    if (created) {
        const blockElement = created.querySelector?.(".block") || created;
        blockElement.classList.add("function-chip");
        container.insertChip(blockElement, segment, offset);
    }
}

// グローバルに割り当て
window.addFunctionBlockToInput = addFunctionBlockToInput;

// ブロック全体の選択・キーボード削除
let selectedBlock = null;

function selectBlock(block) {
    if (selectedBlock === block) return;
    deselectBlock();
    selectedBlock = block;
    selectedBlock.classList.add("selected");
}

function deselectBlock() {
    if (selectedBlock) {
        selectedBlock.classList.remove("selected");
        selectedBlock = null;
    }
}
async function searchdocument(block) {
    if (!pywebviewReady) return;
    const doc = await pywebview.api.get_translated_doc(block.getModuleName, block.getFuncName);
    console.log(doc);
}
document.body.addEventListener("click", (e) => {
    // 入力欄やボタンの操作中はブロックの選択状態を触らない（フォーカス・編集を優先する）
    if (e.target.closest?.('input, textarea, button')) {
        return;
    }

    const block = e.target.closest(".block, .control-block");
    if (block) {
        selectBlock(block);
        searchdocument(block);
    } else {
        deselectBlock();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (!selectedBlock) return;

    const active = document.activeElement;
    const isEditing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (isEditing) return;

    e.preventDefault();
    selectedBlock.remove();
    selectedBlock = null;
});

// body の何もない場所だけをドロップターゲット化する
// （他のブロックやツールボックスの上にドロップしても新規ブロックを作らない）
document.body.addEventListener("dragover", (e) => {
    if (e.target !== document.body) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
});

document.body.addEventListener("drop", (e) => {
    if (e.target !== document.body) return;
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (data) {
        const { moduleName, functionName } = JSON.parse(data);
        addFunctionBlock(moduleName, functionName, e.clientY);
    }
});

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
    block.getFuncName = blockData.block_label;
    block.getModuleName = blockData.block_module;

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

    control.getFuncName = blockData.block_label;
    control.getModuleName = blockData.block_module;
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
            functionLabel.draggable = true;

            functionLabel.addEventListener("dragstart", (e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/json", JSON.stringify({
                    moduleName: moduleName,
                    functionName: element
                }));
            });

            details.appendChild(functionLabel);
        });

        toolsBoxBody.appendChild(details);
    });
})