
import gerberToSvg from 'gerber-to-svg';

const TEST_GERBER = `
%MOMM*%
%FSLAX44Y44*%
D10*
X0Y0D02*
X1000Y0D01*
M02*
`.trim();

async function check() {
    console.log("Checking callback signature...");

    await new Promise((resolve) => {
        const converter = gerberToSvg(TEST_GERBER, { id: 'test' }, (err, result) => {
            if (err) console.error("Error:", err);

            console.log("Type of result:", typeof result);
            if (typeof result === 'object') {
                console.log("Result keys:", Object.keys(result));
                if (result.defs) console.log("Result has defs array");
                if (result.layer) console.log("Result has layer array");
            } else {
                console.log("Result is primitive (likely string)");
                console.log("Full SVG:", result);
            }

            console.log("--- Converter Instance ---");
            // Check the converter instance returned by the function
            console.log("Converter keys:", Object.keys(converter));
            console.log("Converter width:", converter.width);
            console.log("Converter units:", converter.units);
            console.log("Converter defs type:", typeof converter.defs);
            if (Array.isArray(converter.defs)) console.log("Converter defs is Array");

            resolve(null);
        });
    });
}

check();
