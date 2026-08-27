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

// ブロック全体の選択(Shift+クリックで複数選択)・コピペ・ドラッグ移動・キーボード削除
const selectedBlocks = new Set();
let lastSelectedBlock = null;

function isTopLevelBlock(el) {
    return !!el && el.parentElement === blocksBox &&
        (el.classList.contains("block") || el.classList.contains("control-block"));
}

function clearSelection() {
    selectedBlocks.forEach(b => b.classList.remove("selected"));
    selectedBlocks.clear();
    lastSelectedBlock = null;
}

function selectOnly(block) {
    clearSelection();
    if (!block) return;
    selectedBlocks.add(block);
    block.classList.add("selected");
    lastSelectedBlock = block;
}

function toggleSelect(block) {
    if (selectedBlocks.has(block)) {
        selectedBlocks.delete(block);
        block.classList.remove("selected");
    } else {
        selectedBlocks.add(block);
        block.classList.add("selected");
    }
    lastSelectedBlock = block;
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
    if (!block) {
        clearSelection();
        return;
    }

    searchdocument(block);

    if (!isTopLevelBlock(block)) {
        // 埋め込みチップ等ネストしたブロックは複数選択の対象外。
        // ドキュメント表示のために単独選択の見た目だけ付ける
        selectOnly(block);
        return;
    }

    if (e.shiftKey) {
        toggleSelect(block);
    } else {
        selectOnly(block);
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (selectedBlocks.size === 0) return;

    const active = document.activeElement;
    const isEditing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (isEditing) return;

    e.preventDefault();
    selectedBlocks.forEach(b => b.remove());
    clearSelection();
});

// --- コピー(Ctrl+C) / 貼り付け(Ctrl+V) ---
// ブロックのDOM要素にはイベントリスナーやgetValue等のメソッドが直接
// アタッチされているため、cloneNode(true)では複製しても機能しない。
// 元のblockData(createBlock/createControlBlockに渡した定義)を複製し、
// 現在入力されている値をライブDOMから読み取って埋め込んだ上で、
// createBlock/createControlBlockでもう一度組み立て直す。
// (block_backで動的に増減する項目 [importの追加モジュール等] はコピー対象外)
let clipboard = [];

function isRenderableSlideItem(item) {
    return !(item.type === "input" && item.input_type === "block");
}

function fillSlideValues(slideItems, liveContainer) {
    if (!liveContainer) return;
    const liveChildren = Array.from(liveContainer.children);
    let liveIndex = 0;

    slideItems.forEach(item => {
        if (!isRenderableSlideItem(item)) return;
        const live = liveChildren[liveIndex];
        liveIndex++;

        if (item.type === "input" && item.input_type === "text") {
            item.value = live?.getValue ? live.getValue().value : "";
        } else if (item.type === "checked") {
            const warp = live?.querySelector?.(":scope > .input-text-container");
            item.warp = { ...item.warp, value: warp?.getValue ? warp.getValue().value : "" };
        }
    });
}

function extractBlockData(el) {
    if (!el?.blockData) return null;
    const data = JSON.parse(JSON.stringify(el.blockData));

    if (el.classList.contains("control-block")) {
        fillSlideValues(
            data.block_slide ?? [],
            el.querySelector(":scope > .control-block-header > .control-block-header-content")
        );

        const bodyContent = el.querySelector(":scope > .control-block-body > .control-block-body-content");
        const liveBodyBlocks = bodyContent
            ? Array.from(bodyContent.children).filter(c => c.classList.contains("block") || c.classList.contains("control-block"))
            : [];
        data.block_body = liveBodyBlocks.map(extractBlockData).filter(Boolean);
    } else {
        fillSlideValues(data.block_slide ?? [], el.querySelector(":scope > .block-slide"));
    }

    return data;
}

function pasteClipboard() {
    if (clipboard.length === 0) return;

    const ref = lastSelectedBlock && isTopLevelBlock(lastSelectedBlock)
        ? lastSelectedBlock.nextSibling
        : null;

    const pastedBlocks = [];
    clipboard.forEach(data => {
        const clonedData = JSON.parse(JSON.stringify(data));
        const fragment = clonedData.type === "control" ? createControlBlock(clonedData) : createBlock(clonedData);
        if (!fragment) return;

        const el = fragment.firstElementChild;
        blocksBox.insertBefore(fragment, ref);
        pastedBlocks.push(el);
    });

    if (pastedBlocks.length === 0) return;

    clearSelection();
    pastedBlocks.forEach(el => {
        selectedBlocks.add(el);
        el.classList.add("selected");
    });
    lastSelectedBlock = pastedBlocks[pastedBlocks.length - 1];
}

document.addEventListener("keydown", (e) => {
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (!ctrlOrCmd) return;

    const active = document.activeElement;
    const isEditing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (isEditing) return; // テキスト編集中は通常のコピー&ペーストを優先する

    const key = e.key.toLowerCase();
    if (key === "c" && selectedBlocks.size > 0) {
        e.preventDefault();
        const ordered = Array.from(blocksBox.children).filter(el => selectedBlocks.has(el));
        clipboard = ordered.map(extractBlockData).filter(Boolean);
    } else if (key === "v" && clipboard.length > 0) {
        e.preventDefault();
        pasteClipboard();
    }
});

// --- 既存ブロックのドラッグによる並び替え ---
let draggingBlocks = null;

function makeDragHandle(handleEl) {
    handleEl.draggable = true;

    handleEl.addEventListener("dragstart", (e) => {
        const block = handleEl.closest(".block, .control-block");
        if (!isTopLevelBlock(block)) return;

        draggingBlocks = selectedBlocks.has(block)
            ? Array.from(blocksBox.children).filter(el => selectedBlocks.has(el))
            : [block];

        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "");
    });

    handleEl.addEventListener("dragend", () => {
        draggingBlocks = null;
    });
}

// 既存ブロックの並び替えドラッグ中は、blocks-box内のどこにドロップしても
// 受け付ける。それ以外(ツールボックスからの新規ブロック)は、
// blocks-box の何もない場所だけをドロップターゲット化する
// （他のブロックやツールボックスの上にドロップしても新規ブロックを作らない）
blocksBox.addEventListener("dragover", (e) => {
    if (draggingBlocks) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        return;
    }

    if (e.target !== blocksBox) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
});

blocksBox.addEventListener("drop", (e) => {
    if (draggingBlocks) {
        e.preventDefault();
        const ref = getTopLevelBlockBelow(e.clientY);
        const safeRef = draggingBlocks.includes(ref) ? null : ref;
        draggingBlocks.forEach(block => blocksBox.insertBefore(block, safeRef));
        draggingBlocks = null;
        return;
    }

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
    makeDragHandle(color);

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
    block.blockData = blockData;

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
    makeDragHandle(color);

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
    control.blockData = blockData;
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

// --- File > Open file (.pyを読み込んでブロックに変換する) ---
document.getElementById("menu-open-file")?.addEventListener("click", async (e) => {
    if (!pywebviewReady) return;

    const { blocks, skipped, error } = await pywebview.api.load_python_file_dialog();
    if (error) {
        console.error(`Load failed: ${error}`);
    } else {
        (blocks ?? []).forEach(blockData => {
            const created = blockData.type === "control" ? createControlBlock(blockData) : createBlock(blockData);
            if (created) blocksBox.appendChild(created);
        });
        if (skipped) {
            console.warn(`${skipped} statement(s) could not be converted to blocks and were skipped.`);
        }
    }
    e.target.closest("details")?.removeAttribute("open");
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