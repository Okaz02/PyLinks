import { blocksBox, isTopLevelBlock, getTopLevelBlockBelow } from './blocks-dom.js';
import { selectedBlocks } from './selection.js';

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
    const ref = getTopLevelBlockBelow(e.clientY);
    const safeRef = draggingBlocks.includes(ref) ? null : ref;
    draggingBlocks.forEach(block => blocksBox.insertBefore(block, safeRef));
    draggingBlocks = null;
});

export { draggingBlocks, makeDragHandle };
