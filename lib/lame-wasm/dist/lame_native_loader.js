"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWasm = loadWasm;
const generatedLoader = require('./lame_native.js');
function loadWasm(wasmBinary) {
    return new Promise(resolve => {
        generatedLoader({ wasmBinary }).then(ctxWithThen => {
            const { then, ...ctx } = ctxWithThen;
            resolve(ctx);
        });
    });
}
