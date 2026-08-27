import { blocksData } from '../block/blocks.js';
import { createElement } from './parser.js';

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

const spinTemplate = document.getElementById("spin-template");
const blockTemplate = document.getElementById("block-template");
const controlBlockTemplate = document.getElementById("control-block-template");

const blocksBox = document.getElementById("blocks-box");

const toolsBox = document.getElementById("tools-box");
const toolsBoxInput = document.getElementById("tools-box-input");
const toolsBoxBody = document.getElementById("tools-box-body");

const documentBox = document.getElementById("document-box");

// トップレベルのブロックのうち、指定Y座標より下にある最初の要素を返す
// （ドロップした高さに応じて、縦積みの並びの中の適切な位置に挿入するため）
function getTopLevelBlockBelow(y) {
    const topLevelBlocks = Array.from(blocksBox.children).filter(el =>
        el.classList.contains("block") || el.classList.contains("control-block")
    );
    return topLevelBlocks.find(el => el.getBoundingClientRect().top > y) || null;
}

async function addFunctionBlock(moduleName, functionName, dropY) {
    if (!pywebviewReady) return;
    const { block, error } = await pywebview.api.get_function_block(moduleName, functionName);
    if (error || !block) return;

    const created = createBlock(block);

    if (created) {
        const ref = typeof dropY === "number" ? getTopLevelBlockBelow(dropY) : null;
        blocksBox.insertBefore(created, ref);
    }
}

async function addFunctionBlockToInput(moduleName, functionName, container, segment, offset) {
    if (!pywebviewReady) return;
    const { block, error } = await pywebview.api.get_function_block(moduleName, functionName);
    if (error || !block) return;

    const created = createBlock(block);

    if (created) {
        const blockElement = created.querySelector?.(".block") || created;
        blockElement.classList.add("function-chip");
        container.insertChip(blockElement, segment, offset);
    }
}

// blocks.jsで定義済みの定型ブロック(import, assignなど)を配置する
// 関数呼び出しと違いシグネチャ取得が不要なので同期的に作れる
function addStaticBlock(blockData, dropY) {
    const created = blockData.type === "control" ? createControlBlock(blockData) : createBlock(blockData);

    if (created) {
        const ref = typeof dropY === "number" ? getTopLevelBlockBelow(dropY) : null;
        blocksBox.insertBefore(created, ref);
    }
}

function addStaticBlockToInput(blockData, container, segment, offset) {
    const created = blockData.type === "control" ? createControlBlock(blockData) : createBlock(blockData);

    if (created) {
        const blockElement = created.querySelector?.(".block, .control-block") || created;
        blockElement.classList.add("function-chip");
        container.insertChip(blockElement, segment, offset);
    }
}

// グローバルに割り当て
window.addFunctionBlockToInput = addFunctionBlockToInput;
window.addStaticBlockToInput = addStaticBlockToInput;

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
    const spinFragment = spinTemplate.content.cloneNode(true);
    const spin = spinFragment.querySelector(".spinner");

    spin.classList.add("document-spinner");
    documentBox.textContent = "";
    documentBox.appendChild(spinFragment);

    const result = await pywebview.api.get_translated_doc(block.getModuleName, block.getFuncName);

    documentBox.textContent = result.error ? result.error : result.doc;
}

document.body.addEventListener("click", (e) => {
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

// blocks-box の何もない場所だけをドロップターゲット化する
// （他のブロックやツールボックスの上にドロップしても新規ブロックを作らない）
blocksBox.addEventListener("dragover", (e) => {
    if (e.target !== blocksBox) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
});

blocksBox.addEventListener("drop", (e) => {
    if (e.target !== blocksBox) return;
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;

    const parsed = JSON.parse(data);
    if (parsed.kind === "block") {
        addStaticBlock(parsed.blockData, e.clientY);
    } else {
        addFunctionBlock(parsed.moduleName, parsed.functionName, e.clientY);
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
    block.getTag = blockData.block_tag;

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
    control.getTag = blockData.block_tag;
    return fragment;
}

blocksData.blocks.forEach(element => {
    const created = element.type === "control"
        ? createControlBlock(element)
        : createBlock(element);

    if (created) {
        blocksBox.prepend(created);
    }
});

document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    toolsBox.style.top = `${event.clientY}px`;
    toolsBox.style.left = `${event.clientX}px`;
});

toolsBoxInput.addEventListener("input", async () => {
    if (!pywebviewReady) return;

    const moduleInputs = document.querySelectorAll('[data-system="import_module"]');
    const moduleNames = Array.from(moduleInputs)
        .map(input => input.getValue().value)
        .filter(Boolean);

    const query = toolsBoxInput.value;
    const functions = await pywebview.api.search_functions(["builtins", ...moduleNames], query);

    toolsBoxBody.innerHTML = "";

    if (query) {
        const matchedBlocks = blocksData.blocks.filter(blockData =>
            (blockData.name ?? "").toLowerCase().includes(query.toLowerCase())
        );

        if (matchedBlocks.length) {
            const details = document.createElement("details");
            details.className = "tools-box-group";

            const summary = document.createElement("summary");
            summary.textContent = `blocks (${matchedBlocks.length})`;
            details.appendChild(summary);

            matchedBlocks.forEach(blockData => {
                const blockLabel = document.createElement("p");
                blockLabel.className = "tools-box-function";
                blockLabel.textContent = blockData.name;
                blockLabel.draggable = true;

                blockLabel.addEventListener("dragstart", (e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("application/json", JSON.stringify({
                        kind: "block",
                        blockData
                    }));
                });

                details.appendChild(blockLabel);
            });

            toolsBoxBody.appendChild(details);
        }
    }

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
                    kind: "function",
                    moduleName: moduleName,
                    functionName: element
                }));
            });

            details.appendChild(functionLabel);
        });

        toolsBoxBody.appendChild(details);
    });
})