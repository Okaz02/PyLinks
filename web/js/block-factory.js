import { createElement } from './parser.js';
import { makeDragHandle } from './dnd.js';

// blockData(定義データ) <-> DOM の変換を担う

const blockTemplate = document.getElementById("block-template");
const controlBlockTemplate = document.getElementById("control-block-template");

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

// --- ライブDOMからblockDataを復元(コピー用) ---
// ブロックのDOM要素にはイベントリスナーやgetValue等のメソッドが直接
// アタッチされているため、cloneNode(true)では複製しても機能しない。
// 元のblockData(createBlock/createControlBlockに渡した定義)を複製し、
// 現在入力されている値をライブDOMから読み取って埋め込む。
// (block_backで動的に増減する項目 [importの追加モジュール等] はコピー対象外)

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

export { createBlock, createControlBlock, extractBlockData };
