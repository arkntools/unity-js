export type Ptr = number;
type WasmContextBase<T> = {
    HEAP8: Int8Array;
    HEAP16: Int16Array;
    HEAP32: Int32Array;
    HEAPU8: Uint8Array;
    HEAPU16: Uint16Array;
    HEAPU32: Uint32Array;
    HEAPF32: Float32Array;
    HEAPF64: Float64Array;
} & T;
interface WasmFunctions {
    _lamejs_init(sampleRate: number, stereo: boolean, vbrQuality: number): Ptr;
    _lamejs_encode(structPtr: Ptr, numSamples: number): number;
    _lamejs_flush(structPtr: Ptr): number;
    _lamejs_tag_frame(structPtr: Ptr): number;
    _lamejs_free(structPtr: Ptr): number;
    _lamejs_print_debug_info(structPtr: Ptr): void;
    _lamejs_max_encode_samples(): number;
}
export type WasmContext = WasmContextBase<WasmFunctions>;
export declare function loadWasm(wasmBinary?: ArrayBuffer): Promise<WasmContext>;
export {};
