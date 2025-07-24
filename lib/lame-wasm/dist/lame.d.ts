export interface LameInitParams {
    readonly sampleRate: number;
    readonly stereo: boolean;
    readonly debug: boolean;
    readonly vbrQuality: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}
export declare const LAME_INIT_PARAMS_DEFAULTS: LameInitParams;
export declare class Lame {
    private readonly context;
    private readonly params;
    private readonly maxEncodeSamples;
    private readonly structPtr;
    private readonly memoryBuffer;
    private readonly pcmBuffers;
    private readonly outputBuffer;
    static load(params?: Partial<{
        wasmBinary: ArrayBuffer;
    } & LameInitParams>): Promise<Lame>;
    private constructor();
    numChannels(): 1 | 2;
    private getStructPointerAtOffset;
    encode(...channels: Float32Array[]): Iterable<Uint8Array<ArrayBuffer>>;
    flush(): Uint8Array;
    free(): void;
}
