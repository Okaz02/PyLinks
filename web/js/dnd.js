import { blocksBox, isPlacedBlock, findBlockContainerAt, getBlockBelow } from './blocks-dom.js';
import { selectedBlocks } from './selection.js';

// --- 既存ブロックのドラッグによる並び替え(コントロールブロックの本体への移動も含む) ---
let draggingBlocks = null;

function makeDragHandle(handleEl) {
    handleEl.draggable = true;

    handleEl.addEventListener("dragstart", (e) => {
        const block = handleEl.closest(".block, .control-block");
        if (!isPlacedBlock(block)) return;

        const siblings = block.parentElement.children;
        draggingBlocks = selectedBlocks.has(block)
            ? Array.from(siblings).filter(el => selectedBlocks.has(el))
            : [block];

        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "");
    });

    handleEl.addEventListener("dragend", () => {
        draggingBlocks = null;
    });
}

// 既存ブロックの並び替えドラッグ中は、blocks-box内のどこにドロップしても受け付ける。
// 新規ブロックのドロップ(ツールボックスから)はblock-insertion.js側が、
// これが行われていない間だけ処理する
blocksBox.addEventListener("dragover", (e) => {
    if (!draggingBlocks) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
});

blocksBox.addEventListener("drop", (e) => {
    if (!draggingBlocks) return;
    e.preventDefault();

    const container = findBlockContainerAt(e.target);
    // 自分自身(またはその本体)の中には移動できない
    if (draggingBlocks.some(block => block.contains(container))) {
        draggingBlocks = null;
        return;
    }

    const ref = getBlockBelow(container, e.clientY);
    const safeRef = draggingBlocks.includes(ref) ? null : ref;
    draggingBlocks.forEach(block => container.insertBefore(block, safeRef));
    draggingBlocks = null;
});

export { draggingBlocks, makeDragHandle };
