
import gerberToSvg from 'gerber-to-svg';

const gerber = `
G04 Test*
%FSLAX46Y46*%
%MOMM*%
%ADD10C,1*%
D10*
X0Y0D03*
M02*
`;

console.log("Checking converter object properties...");

const converter = gerberToSvg(gerber, (err, result) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log("Callback Result Type:", typeof result);
    // console.log("Result Preview:", result.substring(0, 100));

    console.log("Converter Properties:");
    console.log("units:", converter.units);
    console.log("viewBox:", converter.viewBox);
    console.log("width:", converter.width);
    console.log("height:", converter.height);
    // console.log("defs:", converter.defs ? "Present" : "Missing"); // Private?
    // console.log("layer:", converter.layer ? "Present" : "Missing"); // Private?
});
