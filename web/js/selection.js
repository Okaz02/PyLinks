import { isTopLevelBlock } from './blocks-dom.js';

// ブロック全体の選択(Shift+クリックで複数選択)とキーボード削除、
// 選択中ブロックのドキュメント表示を扱う

let pywebviewReady = !!window.pywebview;
window.addEventListener('pywebviewready', () => { pywebviewReady = true; }, { once: true });

const spinTemplate = document.getElementById("spin-template");
const documentBox = document.getElementById("document-box");

const selectedBlocks = new Set();
let lastSelectedBlock = null;

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

// 貼り付け直後など、複数のブロックをまとめて選択状態にする
function selectMany(blocks) {
    clearSelection();
    blocks.forEach(block => {
        selectedBlocks.add(block);
        block.classList.add("selected");
    });
    lastSelectedBlock = blocks[blocks.length - 1] ?? null;
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

export { selectedBlocks, lastSelectedBlock, clearSelection, selectOnly, toggleSelect, selectMany };
