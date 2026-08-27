// #blocks-box 内の変更をUndo/Redoできるようにする。
//
// ブロックやテキスト入力のDOM要素にはイベントリスナーやメソッド
// (container.getValue / insertChip など) が直接アタッチされているため、
// HTML文字列としてスナップショット→復元する方式だとそれらが失われてしまう。
// そのため、実際に起きたDOM変更(ノードの追加・削除)をMutationObserverで検知して
// そのまま元に戻す/やり直す方式にしている。テキストの変更はフォーカスの出入りで
// 前後の値を比較して検知する。どちらも同じ1本の履歴スタックに時系列で積む。

const blocksBox = document.getElementById("blocks-box");
const toolsBox = document.getElementById("tools-box");
const toolsBoxInput = document.getElementById("tools-box-input");

const undoStack = [];
const redoStack = [];
let isApplying = false;

function pushEntry(entry) {
    if (isApplying) return;
    undoStack.push(entry);
    redoStack.length = 0;
}

function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    isApplying = true;
    entry.undo();
    // entry.undo()が起こしたDOM変更はMutationObserverに非同期(マイクロタスク)で
    // 届くため、isApplyingを同期的にfalseへ戻すだけでは間に合わない。
    // takeRecords()でそのペンディング分を同期的に握りつぶし、新しい履歴として
    // 記録されるのを防ぐ
    structuralObserver.takeRecords();
    isApplying = false;
    redoStack.push(entry);
}

function redo() {
    const entry = redoStack.pop();
    if (!entry) return;
    isApplying = true;
    entry.redo();
    structuralObserver.takeRecords();
    isApplying = false;
    undoStack.push(entry);
}

// --- 構造的な変更(ブロック/チップの追加・削除) ---
// 1回のMutationObserverコールバックにまとまった変更を1つのUndo単位として扱う
const structuralObserver = new MutationObserver((mutations) => {
    const changes = [];

    mutations.forEach(mutation => {
        if (mutation.type !== "childList") return;
        // #tools-boxは#blocks-boxの中にあるが、検索結果の描画し直しなどは
        // ユーザーのブロック編集ではないのでUndo対象から除外する
        if (toolsBox.contains(mutation.target)) return;

        // mutation.nextSiblingは「そのmutation全体」の直後にある兄弟であって、
        // removedNodesが複数ある場合は各ノード個別の値ではない。
        // 同じバッチ内で後続する削除ノードがあればそれを、無ければ
        // mutation.nextSiblingを、そのノードの「戻すべき位置」として使う
        mutation.removedNodes.forEach((node, index) => {
            const nextSibling = index + 1 < mutation.removedNodes.length
                ? mutation.removedNodes[index + 1]
                : mutation.nextSibling;
            changes.push({ added: false, parent: mutation.target, node, nextSibling });
        });
        // addedNodesは追加された直後の実際のDOM位置を読むので、
        // 同じバッチ内の他の追加ノードを指していても常に正しい
        mutation.addedNodes.forEach(node => {
            changes.push({ added: true, parent: mutation.target, node, nextSibling: node.nextSibling });
        });
    });

    if (changes.length === 0) return;

    // 同じバッチの中に「削除」と「追加」の両方が混ざることがある
    // (例: 既存ブロックのドラッグ移動は、同じノードの削除+追加として記録される)。
    // そのため、まず対象タイプの削除をすべて済ませてから、挿入を行う。
    // 挿入は対象ノードが指すnextSiblingがまだDOMに無いことがあるため、
    // バッチ内の依存関係が解決できるよう必ず末尾側(後ろ)から処理する
    const applyChanges = (removeIfAdded) => {
        changes.forEach(change => {
            if (change.added === removeIfAdded) change.node.remove();
        });
        for (let i = changes.length - 1; i >= 0; i--) {
            const change = changes[i];
            if (change.added !== removeIfAdded) change.parent.insertBefore(change.node, change.nextSibling);
        }
    };

    pushEntry({
        undo: () => applyChanges(true),
        redo: () => applyChanges(false),
    });
});
structuralObserver.observe(blocksBox, { childList: true, subtree: true });

// --- テキスト入力の変更 ---
// フォーカスが入った時点の値と、抜けた時点の値を比較して1つの履歴にする
// (1文字ごとに履歴を積むと大量になりすぎるため)
let editingInput = null;
let editingOldValue = "";

function recordValueChange(input, oldValue, newValue) {
    if (oldValue === newValue) return;
    pushEntry({
        undo: () => { input.value = oldValue; },
        redo: () => { input.value = newValue; },
    });
}

// バックスペースでチップをまたいで2つのsegment-inputを結合するときなど、
// フォーカスの出入りを伴わずに値が変わるケースのために外からも呼べるようにする
window.recordValueChange = recordValueChange;

blocksBox.addEventListener("focusin", (e) => {
    if (!e.target.classList?.contains("segment-input")) return;
    editingInput = e.target;
    editingOldValue = e.target.value;
});

blocksBox.addEventListener("focusout", (e) => {
    if (!e.target.classList?.contains("segment-input") || e.target !== editingInput) return;
    recordValueChange(e.target, editingOldValue, e.target.value);
    editingInput = null;
});

// --- キーボードショートカット & メニュー項目 ---
document.addEventListener("keydown", (e) => {
    if (document.activeElement === toolsBoxInput) return;

    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (!ctrlOrCmd) return;

    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
    }
});

function bindMenuItem(id, action) {
    const item = document.getElementById(id);
    item?.addEventListener("click", () => {
        action();
        item.closest("details")?.removeAttribute("open");
    });
}

bindMenuItem("menu-undo", undo);
bindMenuItem("menu-redo", redo);
