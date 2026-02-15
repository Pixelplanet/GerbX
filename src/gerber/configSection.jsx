import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useState, useRef } from 'react';
import './configSection.css'
import { useGerberConfig } from './gerberContext';
import { generateOuterSvg } from './convert';
import svg2png from './svg2png'
import { handleColorChange } from './gerber';
import { changeDpiBlob } from 'changedpi';

export default function ConfigSection(props) {
    const { mainSvg } = useGerberConfig();
    const [isChecked, setIsChecked] = useState(false);

    useEffect(() => {
        if (mainSvg.svg) {
            props.setActive(true);
        }
    }, [mainSvg])

    return (
        <div className="lg:w-1/5 lg:absolute left-0 top-0 bottom-0 bg-gray-900 border-r border-gray-800 h-full overflow-y-auto z-50 flex flex-col pointer-events-auto shadow-xl custom-scrollbar" style={{ 'pointerEvents': props.active ? 'auto' : 'none' }}>
            <div className="p-4 flex flex-col gap-4">
                <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 hidden lg:block">Configuration</div>
                {/* <QuickSetup isChecked={isChecked} pngRef={props.pngRef} /> */}
                <DoubleSideButton isChecked={isChecked} setIsChecked={setIsChecked} />
                <LayersToggleButtons isChecked={isChecked} />
                <CanvasBackground />
            </div>
        </div>
    )
}


const setUpConfig = (topstack, bottomstack) => {
    return {
        'top-trace': {
            side: 'toplayer',
            button: 'trace',
            toggleButtons: [
                { side: 'toplayer', button: 'pads' },
                { side: 'toplayer', button: 'silkscreen' },
                { side: 'commonlayer', button: 'outline' },
                { side: 'commonlayer', button: 'drill' },
                { side: 'commonlayer', button: 'outlayer' },
            ],
            stack: topstack,
            // id: 'top_layer_traces',
            id: 'traces_top_layer',
            color: 'bw',
            layerid: 'top_copper',
            canvas: 'black',
        },
        'top-drill': {
            side: 'commonlayer',
            button: 'drill',
            toggleButtons: [
                { side: 'toplayer', button: 'trace' },
                { side: 'toplayer', button: 'pads' },
                { side: 'toplayer', button: 'silkscreen' },
                { side: 'commonlayer', button: 'outline' },
                { side: 'commonlayer', button: 'outlayer' },
            ],
            stack: topstack,
            id: 'drills_top_layer',
            color: 'bwInvert',
            layerid: 'drill',
            canvas: 'white',
        },
        'top-cut': {
            side: 'commonlayer',
            button: 'outline',
            toggleButtons: [
                { side: 'toplayer', button: 'trace' },
                { side: 'toplayer', button: 'pads' },
                { side: 'toplayer', button: 'silkscreen' },
                { side: 'commonlayer', button: 'drill' },
            ],
            stack: topstack,
            id: 'outline_top_layer',
            color: 'bwInvert',
            layerid: 'outline',
            canvas: 'black',
        },
        'bottom-trace': {
            side: 'bottomlayer',
            button: 'trace',
            toggleButtons: [
                { side: 'bottomlayer', button: 'pads' },
                { side: 'bottomlayer', button: 'silkscreen' },
                { side: 'commonlayer', button: 'outline' },
                { side: 'commonlayer', button: 'drill' },
                { side: 'commonlayer', button: 'outlayer' },
            ],
            stack: bottomstack,
            id: 'traces_bottom_layer',
            color: 'bw',
            layerid: 'bottom_copper',
            canvas: 'black',
        },
        'bottom-cut': {
            side: 'commonlayer',
            button: 'outline',
            toggleButtons: [
                { side: 'bottomlayer', button: 'pads' },
                { side: 'bottomlayer', button: 'silkscreen' },
                { side: 'commonlayer', button: 'drill' },
                { side: 'commonlayer', button: 'outlayer' },
            ],
            stack: bottomstack,
            id: 'outline_bottom_layer',
            color: 'bwInvert',
            layerid: 'outline',
            canvas: 'black',
        }
    }
}

export function QuickSetup(props) {
    const quickSetupRef = useRef(null)
    const {
        mainSvg,
        setMainSvg,
        canvasBg,
        setCanvasBg,
        pngUrls,
        setPngUrls,
        fullLayers,
        topstack,
        bottomstack,
        setIsToggled,
        layerType,
        setLayerType,
        changeSelect,
        setChangeSelect
    } = useGerberConfig();

    const handleSvg = (svg, option, setup) => {
        const [outerSvg, gerberSvg] = svg.querySelectorAll('svg');

        gerberSvg.querySelectorAll('g').forEach(g => {

            if (g.hasAttribute('id')) {
                // console.log('g', g)
                const id = g.getAttribute('id');
                g.style.display = id.includes(setup.layerid) ? 'block' : id.includes(setup.stack.id) ? 'none' : id.includes('drillMask') ? 'none' : '   ';
            }
        })

        const clipPath = gerberSvg.querySelector('clipPath');
        if (clipPath) clipPath.style.display = setup.layerid === 'outline' ? 'block' : 'none';

        const outerG = svg.querySelector(`#${setup.stack === topstack ? 'toplayer' : 'bottomlayer'}outer`);
        outerG.style.display = option === 'top-cut' ? props.isChecked ? 'block' : 'none' : 'none';
        console.log('option', option, 'setup', setup)
    }

    const handleQuickSetup = (option) => {
        const setupConfig = setUpConfig(topstack, bottomstack)
        const setup = setupConfig[option];
        const toggleButtons = setupConfig[option].toggleButtons;

        setIsToggled(prevObject => {
            let updatedState = { ...prevObject };

            // Update the state of the selected button
            updatedState = {
                ...updatedState,
                [setup.side]: {
                    ...updatedState[setup.side],
                    [setup.button]: false,
                }
            }

            // Update the state of the buttons to be toggled
            toggleButtons.forEach(button => {
                updatedState = {
                    ...updatedState,
                    [button.side]: {
                        ...updatedState[button.side],
                        [button.button]: true,
                    }
                }
            })

            return updatedState;
        })

        setCanvasBg(setup.canvas);
        setMainSvg({ id: setup.id, svg: setup.stack.svg })
        setLayerType(setup.color);

        setTimeout(() => {
            handleSvg(setup.stack.svg, option, setup);
            handleColorChange({ color: setup.color, id: topstack.id, svgs: [topstack.svg, bottomstack.svg] });
        }, 300);
    }

    const generatePNG = async (targetSvg, twoSide, name, canvasBg) => {
        return new Promise((resolve, reject) => {
            const [outerSvg, gerberSvg] = targetSvg.querySelectorAll('svg');
            const svg = twoSide ? targetSvg : gerberSvg;

            const drillPath = gerberSvg.querySelector('#drillMask path');
            if (drillPath) drillPath.setAttribute('fill', layerType === 'bw' ? '#ffffff' : '#000000');
            outerSvg.setAttribute('style', `opacity: ${twoSide ? 1 : 0}; fill:${canvasBg === 'black' ? '#ffffff' : '#000000'}`);

            const svgString = new XMLSerializer().serializeToString(svg);
            const width = parseFloat(svg.getAttribute('width'));
            const height = parseFloat(svg.getAttribute('height'));

            svg2png(svgString, width, height, canvasBg).then(canvas => {
                canvas.setAttribute('style', 'width: 100%; height: 100%;');
                canvas.toBlob(pngBlob => {
                    changeDpiBlob(pngBlob, 1000).then((changeBlob) => {
                        const finalBlob = new Blob([changeBlob], { type: 'image/png' });
                        const blobUrl = (window.URL || window.webkitURL || window).createObjectURL(finalBlob);

                        resolve({ name: name, url: blobUrl });
                    })
                }, 'image/png');
            }).catch(err => {
                console.error('Error converting svg to png :', err)
                reject(err);
            });

        })

    }

    const handlePngConversion = async () => {
        if (quickSetupRef.current.value === 'generate-all') {
            const newUrls = []
            for (const option in setUpConfig(topstack, bottomstack)) {
                const setup = setUpConfig(topstack, bottomstack)[option];

                if (!props.isChecked && setup.stack !== topstack) continue;

                const svg = setup.stack.svg.cloneNode(true);
                handleSvg(svg, option, setup);
                handleColorChange({ color: setup.color, id: topstack.id, svgs: [svg] });
                // console.log('Side : ', setup)
                const newUrl = await generatePNG(svg, props.isChecked, setup.id, setup.canvas);
                // console.log( 'newURLS : ',{ name: newUrl.name, url: newUrl.url })
                newUrls.push({ name: newUrl.name, url: newUrl.url });
            }

            // console.log('newUrls', newUrls)
            setPngUrls([...pngUrls, ...newUrls]);
            return
        }

        const targetSvg = mainSvg.svg === fullLayers ? topstack.svg.cloneNode(true) : mainSvg.svg.cloneNode(true);
        // console.log('TargetSVG : ', targetSvg)
        const blob = await generatePNG(targetSvg, props.isChecked, mainSvg.id, canvasBg);
        // console.log( 'newURLS : ',{ name: blob.name, url: blob.url })
        setPngUrls([...pngUrls, { name: blob.name, url: blob.url }]);
    }

    return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
            <h5 className="text-gray-400 text-xs font-bold uppercase mb-2">Quick Setup</h5>
            <div className="flex flex-col gap-2">
                <select
                    name="toolWidth"
                    id="quickSetup"
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    ref={quickSetupRef}
                    value={changeSelect}
                    onChange={(e) => {
                        setChangeSelect(e.target.value);
                        if (e.target.value !== 'generate-all') handleQuickSetup(e.target.value);
                    }}
                >
                    <option value="custom-setup">Custom</option>
                    <option value="top-trace">Top Trace</option>
                    <option value="top-drill">Top Drill</option>
                    <option value="top-cut">Top Cut</option>
                    <option value="bottom-trace" className="bottomSetup" disabled={props.isChecked ? false : true}>Bottom Trace</option>
                    <option value="bottom-cut" className="bottomSetup" disabled={props.isChecked ? false : true}>Bottom Cut</option>
                    <option value="generate-all" style={{ fontWeight: 600 }}>Generate All</option>
                </select>
                <button
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded text-sm transition duration-300 flex items-center justify-center gap-2"
                    id="renderButton"
                    onClick={handlePngConversion}
                    data-layer="toplayers"
                >
                    <span id="renderBtnText">Generate PNG</span>
                    <FontAwesomeIcon icon={faEye} />
                </button>
            </div>
        </div>
    )
}



function DoubleSideButton(props) {
    const { isChecked, setIsChecked } = props;
    const { topstack, bottomstack, fullLayers, handleToggleCick, isToggled, stackConfig, setChangeSelect, layers } = useGerberConfig();
    const toolWidthRef = useRef(null);

    // Auto-detect double sided capability
    useEffect(() => {
        if (layers && layers.length > 0) {
            const hasTop = layers.some(l => l.side === 'top');
            const hasBottom = layers.some(l => l.side === 'bottom');
            if (hasTop && hasBottom) {
                setIsChecked(true);
            }
        }
    }, [layers, setIsChecked]);

    // Effect to handle visibility when checked changes
    useEffect(() => {
        if (topstack && topstack.svg && bottomstack && bottomstack.svg && fullLayers) {
            const topOuter = topstack.svg.querySelector('#toplayerouter');
            if (topOuter) topOuter.style.display = isChecked ? 'none' : 'block';

            const bottomOuter = bottomstack.svg.querySelector('#bottomlayerouter');
            if (bottomOuter) bottomOuter.style.display = isChecked ? 'none' : 'block';

            const fullOuter = fullLayers.querySelector('#fullstackouter');
            if (fullOuter) fullOuter.style.display = isChecked ? 'none' : 'block';
        }
    }, [isChecked, topstack, bottomstack, fullLayers]);


    const handleDoubleSide = (e) => {
        setIsChecked(e.target.checked);

        if (!e.target.checked && !isToggled['commonlayer']['outlayer'] || e.target.checked && isToggled['commonlayer']['outlayer']) {
            handleToggleCick('commonlayer', 'outlayer');
        }
    }

    const handleToolWidth = () => {
        const toolwidth = parseFloat(toolWidthRef.current.value);
        const svgs = [{ stack: topstack, name: 'toplayer' }, { stack: bottomstack, name: 'bottomlayer' }, { stack: fullLayers, name: 'fullstack' }];

        svgs.forEach(({ stack, name }) => {
            const outer = stack.svg.querySelector(`#${name}outer`);
            const main = stack.svg.querySelector(`#${name}MainG`);

            const newOuter = generateOuterSvg(stackConfig.width, stackConfig.height, toolwidth, { viewboxX: stackConfig.viewbox.viewboxX, viewboxY: stackConfig.viewbox.viewboxY });
            newOuter.svg.setAttribute('id', `${name}outer-svg`);
            newOuter.svg.setAttribute('style', 'fill: #86877c; opacity: 0.5');
            stack.svg.setAttribute('width', `${newOuter.width}mm`);
            stack.svg.setAttribute('height', `${newOuter.height}mm`);
            outer.querySelector('svg').replaceWith(newOuter.svg);
            main.setAttribute('transform', `translate(${toolwidth === 0 ? 0 : 3} ${toolwidth === 0 ? 0 : 3})`);
        })
    }

    return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex flex-col gap-3">
            <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm font-medium">Double Side</span>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={isChecked} onChange={handleDoubleSide} />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none ring-0 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
            </div>

            {isChecked && (
                <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-700">
                    <span className="text-gray-400 text-xs text-nowrap">Tool Width</span>
                    <select
                        ref={toolWidthRef}
                        name="toolWidth"
                        id="toolWidth"
                        className="bg-gray-900 border border-gray-600 rounded py-1 px-2 text-white text-xs"
                        onChange={() => { setChangeSelect('custom-setup'); handleToolWidth() }}
                    >
                        <option value="0.8">0.8 mm</option>
                        <option value="0.0">0.0 mm</option>
                    </select>
                </div>
            )}
        </div>
    )
}

function LayersToggleButtons({ isChecked }) {
    const { isToggled } = useGerberConfig();

    const layers = [
        {
            type: 'toplayer', label: 'Top Layer', items: [
                { id: 'top_copper', prop: 'trace', label: 'Trace', color: 'bg-orange-600' },
                { id: 'top_solderpaste', prop: 'pads', label: 'Pads', color: 'bg-yellow-600' }, // Reverted label to 'Pads' per earlier request? Or 'Solder Paste'? Earlier 'Pads' = soldermask. Original code says 'pads'.
                { id: 'top_silkscreen', prop: 'silkscreen', label: 'Silkscreen', color: 'bg-white' }
            ]
        },
        {
            type: 'bottomlayer', label: 'Bottom Layer', items: [
                { id: 'bottom_copper', prop: 'trace', label: 'Trace', color: 'bg-orange-700' },
                { id: 'bottom_solderpaste', prop: 'pads', label: 'Pads', color: 'bg-yellow-700' },
                { id: 'bottom_silkscreen', prop: 'silkscreen', label: 'Silkscreen', color: 'bg-gray-300' }
            ]
        },
        {
            type: 'commonlayer', label: 'Common', items: [
                { id: 'outline', prop: 'outline', label: 'Outline', color: 'bg-green-600' },
                { id: 'drill', prop: 'drill', label: 'Drills', color: 'bg-gray-500' },
                // { id: 'outer', prop: 'outlayer', label: 'Outer', color: 'bg-gray-700' } // Often hidden?
            ]
        }
    ]
    // Filter outlayer? Original: `layer.properties[i] === 'outlayer' ? isChecked ? '' : 'hidden' : ''`
    // And outlayer id is 'outer'.

    return (
        <div className="flex flex-col gap-4">
            {layers.map((group, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                    <div className="text-gray-500 text-xs font-bold uppercase mb-1">{group.label}</div>
                    <div className="flex flex-col gap-1">
                        {group.items.map((item, i) => (
                            <ToggleButton
                                key={i}
                                layerType={group.type}
                                layerProperty={item.prop}
                                isToggled={isToggled[group.type][item.prop]}
                                layerId={item.id}
                                label={item.label}
                                isChecked={isChecked}
                            />
                        ))}
                        {/* Handle 'outlayer' special case separately if needed or just skip it as it's rarely used manually? 
                             The original code had it in 'commonlayer'.
                             Let's add it if isChecked is true.
                         */}
                        {group.type === 'commonlayer' && isChecked && (
                            <ToggleButton
                                layerType="commonlayer"
                                layerProperty="outlayer"
                                isToggled={isToggled['commonlayer']['outlayer']}
                                layerId="outer"
                                label="Alignment Border"
                                isChecked={isChecked}
                            />
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

function ToggleButton(props) {
    const { topstack, bottomstack, fullLayers, handleToggleCick, setChangeSelect } = useGerberConfig();
    const { layerType, layerProperty, isToggled, layerId, isChecked, label } = props;

    // IsToggled logic: Inverted as per previous fix request
    // "Show/hide buttons ... are inverted ... will hide the layers when activated" = User complaint.
    // My previous fix: `layer.style.display = !isToggled ? 'block' : 'none';`
    // Wait, if isToggled (state is true), display is 'none' (Hidden).
    // So 'Active' state = 'Hidden'.
    // If I want 'Active' (Eye Open) = 'Visible', then display should be 'block'.
    // But earlier I inverted it because user said "inverted".
    // If user says "inverted right now", I should fix it.
    // If currently true = hidden, user sees "Active -> Hidden".
    // User wants "Active -> Visible".
    // So I should set `display = isToggled ? 'block' : 'none'` IF the state matches reality.
    // The previous fix applied `!isToggled`. This means True (Active) -> Block (Visible).
    // So if I click, state toggles.
    // Let's stick to the visual logic: Eye Open = Visible. Eye Slash = Hidden.

    const handleClick = () => {
        let layerGroups = [];

        if (layerType === 'toplayer') {
            layerGroups = [topstack.svg.querySelectorAll('g'), fullLayers.querySelectorAll('g')];
        } else if (layerType === 'bottomlayer') {
            layerGroups = [bottomstack.svg.querySelectorAll('g'), fullLayers.querySelectorAll('g')];
        } else {
            layerGroups = [topstack.svg.querySelectorAll('g'), bottomstack.svg.querySelectorAll('g'), fullLayers.querySelectorAll('g')];
        }

        layerGroups.forEach(layerGroup => {
            layerGroup.forEach(layer => {
                if (layer.hasAttribute('id') && layer.getAttribute('id').includes(layerId)) {
                    // Current logic in app: !isToggled ? block : none.
                    // If isToggled (old state) is false (Hidden), !false = true => Block (Visible).
                    // This assumes we are using the *old* state to determine the *new* state.
                    // If old is False (Hidden), New is True (Visible).
                    // So we want 'block'.
                    // Code using !isToggled seems correct for transitions.
                    layer.style.display = !isToggled ? 'block' : 'none';
                }
            })
        })

        if (layerId === 'outline') {
            [topstack, bottomstack].forEach(stack => {
                const clipPath = stack.svg.querySelector('clipPath');
                if (clipPath) {
                    clipPath.style.display = !isToggled ? 'block' : 'none';
                }
            })
        }
        handleToggleCick(layerType, layerProperty);
    }

    return (
        <div
            className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors border border-transparent ${isToggled ? 'bg-gray-800' : 'bg-gray-800 opacity-50 hover:opacity-100'}`}
            onClick={() => { setChangeSelect('custom-setup'); handleClick() }}
        >
            <span className={`text-sm font-medium ${isToggled ? 'text-white' : 'text-gray-400'}`}>{label}</span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isToggled ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                <FontAwesomeIcon icon={isToggled ? faEye : faEyeSlash} size="xs" />
            </div>
        </div>
    )
}


function CanvasBackground() {
    const { canvasBg, setCanvasBg, setChangeSelect } = useGerberConfig();
    return (
        <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                <label className="text-gray-300 text-sm font-medium">Canvas</label>
                <select
                    name="canvasSelect"
                    id="canvasBg"
                    className="bg-gray-900 border border-gray-600 rounded py-1 px-2 text-white text-xs focus:outline-none"
                    onChange={(e) => { setCanvasBg(e.target.value); setChangeSelect('custom-setup') }}
                    value={canvasBg}
                >
                    <option value="black">Black</option>
                    <option value="white">White</option>
                </select>
            </div>
        </div>
    )
}



