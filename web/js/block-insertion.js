import { createBlock, createControlBlock, extractBlockData } from './block-factory.js';
import { blocksBox, getTopLevelBlockBelow, isTopLevelBlock } from './blocks-dom.js';
import { selectedBlocks, lastSelectedBlock, selectMany } from './selection.js';
import { draggingBlocks } from './dnd.js';

// 新規ブロックがblocks-boxに増える経路(ツールボックスのドロップ、貼り付け、
// ファイル読み込み)をまとめて扱う

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

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

// グローバルに割り当て(parser.jsの入力チップUIから呼ばれる)
window.addFunctionBlockToInput = addFunctionBlockToInput;
window.addStaticBlockToInput = addStaticBlockToInput;

// ツールボックスからの新規ブロックドロップだけを受け付ける。
// 既存ブロックの並び替えドラッグ中(draggingBlocksがある間)はdnd.js側が処理するので
// ここでは何もしない
blocksBox.addEventListener("dragover", (e) => {
    if (draggingBlocks) return;
    if (e.target !== blocksBox) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
});

blocksBox.addEventListener("drop", (e) => {
    if (draggingBlocks) return;
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

// --- コピー(Ctrl+C) / 貼り付け(Ctrl+V) ---
let clipboard = [];

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
    selectMany(pastedBlocks);
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
