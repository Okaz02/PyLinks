import { blocksData } from '../block/blocks.js';
import { blocksBox } from './blocks-dom.js';
import { createBlock, createControlBlock } from './block-factory.js';
import './selection.js';
import './dnd.js';
import './block-insertion.js';
import './toolbox.js';

blocksData.blocks.forEach(element => {
    const created = element.type === "control"
        ? createControlBlock(element)
        : createBlock(element);

    if (created) {
        blocksBox.prepend(created);
    }
});
