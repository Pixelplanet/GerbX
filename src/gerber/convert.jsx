import JSZip from 'jszip';

export default async function convertToSvg(files, setTopStack, setBottomStack, setFullLayers, setMainSvg, setStackConfig, setLayers) {
    const stackup = await useStackup(files);
    if (!stackup) { // Error handled in useStackup or needs rethrow?
        throw new Error("No Gerber files processed");
    }

    // Initial processing, save the detected layers to state
    if (setLayers) {
        // Map stackup layers to a format suitable for editing
        // stackup.layers has type, side, etc.
        setLayers(stackup.layers.map(l => ({
            filename: l.filename,
            gerber: l.gerber, // Raw content
            type: l.type,
            side: l.side,
            id: l.type + l.side + Math.random(), // Helper ID
            enabled: true // Default enable all layers so they appear in 'Manage' modal and match initial view
        })));
    }

    // Filter stackup.layers for the initial display logic
    // We want to ensure 'all' side (Drills/Outline) are included in the initial render along with Top/Bottom
    const filteredStackup = {
        ...stackup,
        layers: stackup.layers.filter(l => l.side === 'top' || l.side === 'bottom' || l.side === 'all')
    };

    processStackupResult(filteredStackup, setTopStack, setBottomStack, setFullLayers, setMainSvg, setStackConfig);
}

export async function reprocessStackup(layers, setTopStack, setBottomStack, setFullLayers, setMainSvg, setStackConfig) {
    // Filter enabled layers
    const enabledLayers = layers.filter(l => l.enabled !== false);

    // Run pcbStackup again. 
    // We strictly pass the properties that pcbStackup respects.
    const inputLayers = enabledLayers.map(l => ({
        filename: l.filename,
        gerber: l.gerber,
        type: l.type,
        side: l.side
    }));

    try {
        const stackup = await pcbStackup(inputLayers, { maskWithOutline: false, outlineGapFill: 0.011 });
        // Attach raw layers for consistency, though we are using the 'layers' argument for next time
        stackup.layers = inputLayers;

        processStackupResult(stackup, setTopStack, setBottomStack, setFullLayers, setMainSvg, setStackConfig);
    } catch (e) {
        console.error("Reprocessing failed", e);
        alert("Failed to reprocess layers: " + e.message);
    }
}

function processStackupResult(stackup, setTopStack, setBottomStack, setFullLayers, setMainSvg, setStackConfig) {
    const topxmlDoc = new DOMParser().parseFromString(stackup.top.svg, 'image/svg+xml');
    const topsvg = topxmlDoc.documentElement;
    const bottomxmlDoc = new DOMParser().parseFromString(stackup.bottom.svg, 'image/svg+xml');
    const bottomsvg = bottomxmlDoc.documentElement;

    const newTopSvg = modifiedSvg({ svg: topsvg, id: 'toplayer', viewbox: stackup.top.viewBox, width: stackup.top.width, height: stackup.top.height })
    const newBottomSvg = modifiedSvg({ svg: bottomsvg, id: 'bottomlayer', viewbox: stackup.bottom.viewBox, width: stackup.bottom.width, height: stackup.bottom.height })

    const fullStackSvg = useGerberToSvg(stackup.layers, stackup.top)
    const newFullStackSvg = modifiedSvg({ svg: fullStackSvg, id: 'fullstack', viewbox: stackup.top.viewBox, width: stackup.top.width, height: stackup.top.height })

    setStackConfig({
        viewbox: {
            viewboxX: stackup.top.viewBox[0],
            viewboxY: stackup.top.viewBox[1],
            viewboxW: stackup.top.viewBox[2],
            viewboxH: stackup.top.viewBox[3]
        },
        width: stackup.top.width,
        height: stackup.top.height
    })

    setFullLayers(newFullStackSvg)
    setTopStack({ id: stackup.id, svg: newTopSvg })
    setBottomStack({ id: stackup.id, svg: newBottomSvg })
    setMainSvg({ id: 'top_layer', svg: newTopSvg });
}

async function useStackup(filesList) {
    const layers = await processFiles(filesList);

    if (layers.length === 0) {
        return null;
    }

    return pcbStackup(layers, { maskWithOutline: false, outlineGapFill: 0.011 })
        .then(stackup => {
            stackup.layers = stackup.layers.map((l, i) => ({ ...l, gerber: layers[i].gerber, filename: layers[i].filename }));
            return stackup;
        })
        .catch(error => { console.error(error); return null; });
}

async function processFiles(filesList) {
    const layers = [];
    // Added 'pro' for Proteus
    const isGerber = (name) => /\.(gbr|gtl|gbl|gts|gbs|gto|gbo|gko|gm[0-9]|drl|xln|txt|svg|sol|cmp|stc|sts|plc|pls|dim|mil|gml|drd|pro)$/i.test(name);

    for (const file of Array.from(filesList)) {
        if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
            try {
                const zip = new JSZip();
                const zipContent = await zip.loadAsync(file);

                for (const [filename, fileData] of Object.entries(zipContent.files)) {
                    if (fileData.dir || !isGerber(filename) || filename.includes('__MACOSX')) continue;
                    const content = await fileData.async('string');
                    layers.push({ filename, gerber: content });
                }
            } catch (e) {
                console.error("Failed to unzip", e);
            }
        } else {
            if (!isGerber(file.name)) continue;
            const content = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsText(file);
            });
            layers.push({ filename: file.name, gerber: content });
        }
    }
    return layers;
}


function useGerberToSvg(layers, svgData) {
    const ids = layers.map(({ side, type }) => `${side}_${type}`);

    const svg = svgData.svg;
    const svgDoc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const rootGElement = svgDoc.documentElement.querySelector('svg > g');
    const gTransform = rootGElement.getAttribute('transform');

    const fullLayerSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries(svgData.attributes)) {
        fullLayerSvg.setAttribute(key, value);
    }

    const fullLayerDef = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const fullLayerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    fullLayerG.setAttribute('transform', gTransform);

    layers.forEach((layer, index) => {
        // layer.gerber is the string content
        let svgContent = '';

        // gerberToSvg returns a stream-like object in browser if using the standalone lib?
        // or effectively we can use the library's function.
        // references says `gerberToSvg(string | buffer)`

        try {
            const gerberToSvgStream = gerberToSvg(layer.gerber);

            gerberToSvgStream.on('data', (chunk) => { svgContent += chunk; });

            gerberToSvgStream.on('end', () => {
                const parser = new DOMParser();
                const layerSvgDoc = parser.parseFromString(svgContent, 'image/svg+xml');

                const defElement = layerSvgDoc.querySelector('defs');
                if (defElement) {
                    // Unique IDs to avoid collisions?
                    // For now append as is
                    fullLayerDef.appendChild(defElement);
                }

                const gElement = layerSvgDoc.querySelector('g');
                if (gElement) {
                    gElement.setAttribute('id', `g-${ids[index]}`);
                    gElement.removeAttribute('transform');

                    const layerStyle = {
                        'top_copper': { color: 'crimson', opacity: 0.8 },
                        'bottom_copper': { color: '#008208', opacity: 0.8 },
                        'all_outline': { color: 'green', opacity: 0.8 },
                        'all_drill': { color: '#555555', opacity: 1 },
                        'top_silkscreen': { color: 'red', opacity: 0.8 },
                        'bottom_silkscreen': { color: 'blue', opacity: 0.8 },
                        'bottom_soldermask': { color: '#757500', opacity: 0.8, display: 'none' },
                        'bottom_solderpaste': { color: 'orange', opacity: 0.8 },
                        'top_solderpaste': { color: '#c362c3', opacity: 0.8 },
                        'top_soldermask': { color: '#af4e5f', opacity: 0.8, display: 'none' },
                    };

                    const styleKey = ids[index];
                    const style = layerStyle[styleKey] || { color: 'green', opacity: 0.5 };
                    gElement.setAttribute('style', `color: ${style.color}; opacity: ${style.opacity}; display: ${style.display ? style.display : 'block'}`);
                    fullLayerG.appendChild(gElement);
                }
            });
        } catch (e) {
            console.warn(`Error processing layer ${index}:`, e);
        }
    });

    fullLayerSvg.appendChild(fullLayerDef);
    fullLayerSvg.appendChild(fullLayerG);

    return fullLayerSvg
}


function modifiedSvg(props) {
    const { svg, id, viewbox, width, height } = props;
    // console.log('SVG', svg, id, viewbox, width, height)
    const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const outerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const mainG = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    if (id !== 'fullstack') {
        const Gs = svg.querySelectorAll('g');
        Gs.forEach((g) => {
            if (g.hasAttribute('id')) {
                if (g.getAttribute('id').includes('soldermask')) {
                    g.style.display = g.style.display === 'none' ? 'block' : 'none';
                }
            }
        })
    }

    const clipPath = svg.querySelector('clipPath');
    if (clipPath) {
        const d = clipPath.querySelector('path').getAttribute('d');

        const outlineG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        outlineG.setAttribute('id', 'drillMask');
        const topLayerTransform = `translate(${viewbox[0] + 440} ${viewbox[1] + viewbox[3] - 500}) scale(0.99, -0.99) translate(${-viewbox[0]} ${-viewbox[1]})`
        const bottomLayerTransform = `translate(${viewbox[0] + viewbox[2] - 440} ${viewbox[1] + viewbox[3] - 500}) scale(-0.99, -0.99) translate(${-viewbox[0]} ${-viewbox[1]})`
        outlineG.setAttribute('transform', `${id === 'toplayer' ? topLayerTransform : bottomLayerTransform}`);
        outlineG.appendChild(path);

        svg.insertBefore(outlineG, svg.firstChild);
    }


    const outer = generateOuterSvg(width, height, 0.8, { viewboxX: viewbox[0], viewboxY: viewbox[1] });

    outer.svg.setAttribute('style', 'fill: #86877c; opacity: 0.5');
    outer.svg.setAttribute('id', `${id}outer-svg`);
    outerG.setAttribute('id', `${id}outer`);
    outerG.setAttribute('style', 'display: none;')

    newSvg.setAttribute('id', `${id}`);
    newSvg.setAttribute('width', `${outer.width}mm`);
    newSvg.setAttribute('height', `${outer.height}mm`);

    svg.setAttribute('id', `${id}svg`);
    // mainG.appendChild(svg);
    mainG.setAttribute('id', `${id}MainG`);
    mainG.setAttribute('transform', 'translate(3, 3)');

    outerG.appendChild(outer.svg);
    mainG.appendChild(svg);
    newSvg.appendChild(outerG);
    newSvg.appendChild(mainG);

    return newSvg
}


export function generateOuterSvg(width, height, toolwidth, viewbox) {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const originX = viewbox.viewboxX;
    const originY = viewbox.viewboxY;
    // svg_outer_width = width + 2 * toolwidth;
    // svg_outer_height = height + 2 * toolwidth;

    // Generate Outer SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `${originX - toolwidth} ${originY - toolwidth} ${width + 2 * toolwidth} ${height + 2 * toolwidth}`);
    svg.setAttribute('width', `${width + 2 * toolwidth}mm`);
    svg.setAttribute('height', `${height + 2 * toolwidth}mm`);

    const pathlines = `
    M ${originX} ${originY}
    L ${originX + halfWidth + 2 * toolwidth} ${originY}
    L ${originX + halfWidth + 2 * toolwidth} ${originY - toolwidth}
    L ${originX + width} ${originY - toolwidth}
    L ${originX + width + toolwidth} ${originY}
    L ${originX + width + toolwidth} ${originY + halfHeight + 2 * toolwidth}
    L ${originX + width} ${originY + halfHeight + 2 * toolwidth}
    L ${originX + width} ${originY + height}
    L ${originX + halfWidth - 2 * toolwidth} ${originY + height}
    L ${originX + halfWidth - 2 * toolwidth} ${originY + height + toolwidth}
    L ${originX} ${originY + height + toolwidth}
    L ${originX - toolwidth} ${originY + height}
    L ${originX - toolwidth} ${originY + halfHeight - 2 * toolwidth}
    L ${originX} ${originY + halfHeight - 2 * toolwidth}
    L ${originX} ${originY}
    Z`

    let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathlines);

    svg.appendChild(path)


    let response = {
        svg: svg,
        width: width + 2 * toolwidth,
        height: height + 2 * toolwidth,
    }
    return response
}