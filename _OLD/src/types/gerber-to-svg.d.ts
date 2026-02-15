
declare module 'gerber-to-svg' {
    import { Transform } from 'stream';

    interface Converter extends Transform {
        units: string;
        viewBox: number[];
        width: number;
        height: number;
        defs: any[];
        layer: any[];
    }

    function gerberToSvg(text: string, options?: any): Converter;
    export default gerberToSvg;
}
