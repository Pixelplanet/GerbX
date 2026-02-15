import { useEffect, useRef, useState } from "react";
import ConfigSection, { QuickSetup } from "./configSection.jsx"
import './gerber.css'
import convertToSvg, { reprocessStackup } from "./convert.jsx";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useGerberConfig } from "./gerberContext.jsx";
import { PngComponent } from "./svg2png.jsx";
import JSZip from "jszip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight, faDownload, faFileExport } from "@fortawesome/free-solid-svg-icons";
import { XCSGenerator } from "./XCSGenerator.js";
import { DndContext, useDraggable, useDroppable, DragOverlay, closestCenter } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';


export default function GerberSection() {
    const [isAnimating, setIsAnimating] = useState(false);
    const { mainSvg, pngUrls, setPngUrls } = useGerberConfig();
    const [active, setActive] = useState(false);
    const [showLayerManager, setShowLayerManager] = useState(false);
    const resultRef = useRef(null);
    const pngRef = useRef(null);
    const dropAreaRef = useRef(null);
    const transformRef = useRef(null);
    const containerRef = useRef(null); // Ref for the GridSection wrapper to get dimensions

    // Initial Zoom Issue Fix: Using a small delay and resizing
    useEffect(() => {
        if (resultRef.current && mainSvg.svg) {
            setIsAnimating(true);
            setTimeout(() => {
                resultRef.current.innerHTML = '';
                setTimeout(() => {
                    resultRef.current.appendChild(mainSvg.svg);
                    setIsAnimating(false);

                    // Auto-zoom logic
                    if (transformRef.current && resultRef.current) {
                        const svgElement = mainSvg.svg;
                        const wrapper = transformRef.current.instance.wrapperComponent;

                        if (svgElement && wrapper) {
                            // Get Client Dimensions
                            const wrapperWidth = wrapper.clientWidth;
                            const wrapperHeight = wrapper.clientHeight;

                            // Get SVG Dimensions - attributes are usually in mm for gerbers, need bbox or pixel equivalent?
                            // gerber-to-svg usually sets width/height attributes in mm, e.g. "100mm"
                            // We need to parse this or get bbox.
                            // BBox is more reliable for drawn content.
                            // But since it's appended, we can try getBBox() if it's in the DOM.
                            // However, getBBox needs it to be rendered.

                            try {
                                // Simple attribute parsing if bbox fails or as fallback
                                let svgW = parseFloat(svgElement.getAttribute('width'));
                                let svgH = parseFloat(svgElement.getAttribute('height'));

                                // If units are mm, we might need conversion if viewer is pixel based?
                                // Browsers usually treat unitless as pixels. '100mm' -> converted to px by browser.
                                // Let's rely on clientWidth/Height of the rendered SVG if possible?
                                // But resultRef is w-fit, so it should take SVG size.

                                const svgRect = svgElement.getBoundingClientRect();
                                if (svgRect.width && svgRect.height) {
                                    svgW = svgRect.width;
                                    svgH = svgRect.height;
                                }

                                if (svgW && svgH && wrapperWidth && wrapperHeight) {
                                    const scaleX = (wrapperWidth * 0.9) / svgW;
                                    const scaleY = (wrapperHeight * 0.9) / svgH;
                                    const fitScale = Math.min(scaleX, scaleY);

                                    // Reset and Zoom
                                    transformRef.current.resetTransform();
                                    setTimeout(() => {
                                        transformRef.current.centerView(fitScale);
                                    }, 50);
                                } else {
                                    // Fallback
                                    transformRef.current.resetTransform();
                                    transformRef.current.centerView(0.85);
                                }
                            } catch (e) {
                                console.warn("Auto-zoom calc failed", e);
                                transformRef.current.resetTransform();
                                transformRef.current.centerView(0.85);
                            }
                        }
                    }
                }, 250);
            }, 300);
        }
    }, [mainSvg])


    const downloadZip = () => {
        const zip = new JSZip();
        Promise.all(
            pngUrls.map((pngBlob, index) => {
                return new Promise((resolve) => {
                    fetch(pngBlob.url).then(response => response.blob()).then(blob => {
                        zip.file(`${pngBlob.name}_${index}.png`, blob);
                        resolve();
                    })
                })
            })
        ).then(() => {
            zip.generateAsync({ type: 'blob' }).then(zipBlob => {
                const url = window.URL.createObjectURL(zipBlob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `gerber_files_${pngUrls.length}.zip`);
                document.body.appendChild(link);
                link.click();
            }).catch(err => { console.log('Error Generating Zip File :', err) })
        })
    }


    const exportToXCS = () => {
        if (!mainSvg.svg) return;

        const layers = [];

        const extractPaths = (element) => {
            const paths = [];
            element.querySelectorAll('path').forEach(p => {
                paths.push(p.getAttribute('d'));
            });
            return paths;
        };

        const { fullLayers, stackConfig } = useGerberConfig();
        const sourceSvg = fullLayers || mainSvg.svg;

        if (!sourceSvg) return;

        sourceSvg.querySelectorAll('g').forEach(g => {
            const id = g.getAttribute('id');
            const style = g.getAttribute('style') || '';

            if (!id || !id.startsWith('g-')) return;

            let color = '#000000';
            const colorMatch = style.match(/color:\s*([^;]+)/);
            if (colorMatch) color = colorMatch[1].trim();

            const colorMap = {
                'crimson': '#DC143C', 'green': '#008000', 'red': '#FF0000', 'blue': '#0000FF',
                'orange': '#FFA500', 'purple': '#800080', 'black': '#000000', 'white': '#FFFFFF'
            };
            if (colorMap[color]) color = colorMap[color];

            const paths = extractPaths(g);
            if (paths.length > 0) {
                let speed = 100;
                let power = 20;
                let passes = 1;

                if (id.includes('copper')) { speed = 50; power = 80; }
                else if (id.includes('mask')) { speed = 150; power = 15; }
                else if (id.includes('silk')) { speed = 200; power = 10; }
                else if (id.includes('outline')) { speed = 20; power = 100; passes = 2; }

                layers.push({
                    name: id.replace('g-', ''),
                    visible: true,
                    color: color,
                    paths: paths,
                    speed, power, passes,
                    lpi: 200, isCrossHatch: false
                });
            }
        });

        if (layers.length === 0) {
            alert("No layers found to export!");
            return;
        }

        const generator = new XCSGenerator({ activeDevice: 'f2_ultra_uv' });
        const { width, height } = stackConfig || { width: 100, height: 100 };

        const xcsContent = generator.generate(null, layers, { width, height });

        const blob = new Blob([xcsContent], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'gerber_export.xcs');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    const exportToSVG = () => {
        if (!mainSvg.svg) return;
        const serializer = new XMLSerializer();
        const source = serializer.serializeToString(mainSvg.svg);
        const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${mainSvg.id || "gerber_export"}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const transitionStyle = {
        transition: 'opacity 0.3s ease-in-out',
        opacity: isAnimating ? 0 : 1,
    };

    return (
        <>
            <div className="relative h-[90%] w-full flex justify-center">

                <ConfigSection pngRef={pngRef} active={active} setActive={setActive} />

                {/* Middle Content - Viewer */}
                {/* Adjusted to account for Fixed Right Sidebar 250px and Left Sidebar 20% */}
                <div className="lg:left-[20%] lg:right-[250px] lg:absolute w-auto top-0 bottom-0 gridsection h-full" ref={containerRef}>
                    <RefreshButton dropAreaRef={dropAreaRef} resultRef={resultRef} setIsAnimating={setIsAnimating} setActive={setActive} />

                    <div className="absolute top-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
                        <div className="pointer-events-auto">
                            <SvgSideComponent active={active} setShowLayerManager={setShowLayerManager} />
                        </div>
                    </div>

                    <DropAreaComponent dropAreaRef={dropAreaRef} resultRef={resultRef} />

                    <TransformWrapper ref={transformRef} initialScale={1} minScale={.05} limitToBounds={false} centerOnInit={true} wheel={{ step: 0.1 }}>
                        <TransformComponent
                            contentStyle={{ width: 'fit-content', height: 'fit-content' }}
                            wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }}
                        >
                            <div ref={resultRef} style={transitionStyle} className="w-fit h-fit"></div>
                        </TransformComponent>
                    </TransformWrapper>

                    <SvgColorComponent active={active} />
                </div>

                {/* Right Sidebar - Exports */}
                <RightSidebar
                    active={active}
                    pngUrls={pngUrls}
                    setPngUrls={setPngUrls}
                    downloadZip={downloadZip}
                    exportToXCS={exportToXCS}
                    exportToSVG={exportToSVG}
                    pngRef={pngRef}
                />

            </div>
            <LayerManagerModal show={showLayerManager} onClose={() => setShowLayerManager(false)} />
        </>
    )
}

function RightSidebar({ active, pngUrls, setPngUrls, downloadZip, exportToXCS, exportToSVG, pngRef }) {

    // QuickSetup needs isChecked prop potentially. For now creating local state.
    const [isChecked, setIsChecked] = useState(false);

    return (
        <div className="lg:w-[250px] lg:absolute right-0 top-0 bottom-0 bg-gray-900 border-l border-gray-800 h-full overflow-y-auto z-50 flex flex-col pointer-events-auto shadow-xl custom-scrollbar" style={{ 'pointerEvents': active ? 'auto' : 'none' }}>
            <div className="p-4 flex flex-col gap-4">
                <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 hidden lg:block">Export & Save</div>

                {/* Quick Setup Moved Here */}
                <QuickSetup isChecked={isChecked} pngRef={pngRef} />

                <div className="h-px bg-gray-700 my-2"></div>

                {/* Exports */}
                <div className="flex flex-col gap-2">
                    <button className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-3 rounded text-sm transition flex items-center justify-center gap-2" onClick={exportToXCS}>
                        <FontAwesomeIcon icon={faDownload} /> Export XCS
                    </button>
                    <button className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded text-sm transition flex items-center justify-center gap-2" onClick={exportToSVG}>
                        <FontAwesomeIcon icon={faFileExport} /> Export SVG
                    </button>
                    {pngUrls.length > 0 && (
                        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded text-sm transition flex items-center justify-center gap-2" onClick={downloadZip}>
                            <FontAwesomeIcon icon={faDownload} /> Download ZIP
                        </button>
                    )}
                </div>

                {/* PNG List */}
                <div ref={pngRef} className="flex flex-col gap-3 mt-4">
                    {pngUrls.length > 0 && <div className="text-gray-500 text-xs font-bold uppercase">Generated PNGs</div>}
                    {/* Create a shallow copy to reverse */}
                    {pngUrls.slice().reverse().map((url, index) => (
                        <PngComponent
                            key={index}
                            blobUrl={url.url}
                            name={`${url.name}_1000dpi.png`}
                            handleDelete={() => {
                                setPngUrls((prevState) => {
                                    const newState = [...prevState];
                                    newState.splice(pngUrls.length - 1 - index, 1);
                                    return newState
                                });
                            }}
                        />
                    ))}
                </div>

                {!active && pngUrls.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-xs italic mt-10">
                        No active file or exports
                    </div>
                )}
            </div>
        </div>
    )
}


function DropAreaComponent(props) {
    const { setTopStack, setBottomStack, setFullLayers, setMainSvg, setLayerType, setStackConfig, setLayers } = useGerberConfig();

    const [isDragging, setIsDragging] = useState(false);
    // const dropAreaRef = useRef(null);

    const handleInputFiles = (e) => {
        e.preventDefault();
        setIsDragging(false)

        // Access the Files From DataTransfer Object if the files are dropped
        const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
        convertToSvg(files, setTopStack, setBottomStack, setFullLayers, setMainSvg, setStackConfig, setLayers).then(() => {
            if (e.target.files) {
                const newInput = document.createElement('input');
                newInput.multiple = true;
                newInput.type = 'file';
                e.target.parentNode.replaceChild(newInput, e.target);
            }

            props.dropAreaRef.current.style.display = 'none';
            props.resultRef.current.style.display = 'flex';
            setLayerType('original')
        })
            .catch((err) => {
                console.error("Conversion failed:", err);
                alert(err.message || "Failed to parse Gerber files. Please ensure you are uploading valid files or a ZIP archive containing Gerber files.");
            });
    }

    return (
        <>
            <div
                ref={props.dropAreaRef}
                className={`dropArea ${isDragging ? 'active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
                onDrop={handleInputFiles}
            >
                <div className="dropbox">
                    <div className="shadow">
                        <p>Drop your Gerber ZIP or files here</p>
                        <input type="file" id="gerberFileInput" onChange={handleInputFiles} multiple />
                    </div>
                </div>
            </div>
        </>
    )
}

function SvgColorComponent({ active }) {
    const { topstack, bottomstack, layerType, setLayerType, setChangeSelect } = useGerberConfig();
    return (
        <>
            <div className="layerTypeBtnGroup" style={{ pointerEvents: active ? 'auto' : 'none' }}>
                <button
                    id="original"
                    className={`button-side colorButton ${layerType === 'original' ? 'active' : ''}`}
                    role="button"
                    onClick={() => { handleColorChange({ color: 'original', id: topstack.id, svgs: [topstack.svg, bottomstack.svg] }); setLayerType('original'); setChangeSelect('custom-setup') }}
                ><span className="textnew_gerber_png">Original</span></button>

                <button
                    id="bw"
                    className={`button-side colorButton ${layerType === 'bw' ? 'active' : ''}`}
                    role="button"
                    onClick={() => { handleColorChange({ color: 'bw', id: topstack.id, svgs: [topstack.svg, bottomstack.svg] }); setLayerType('bw'); setChangeSelect('custom-setup') }}
                ><span className="text">B/W</span></button>

                <button
                    id="invert"
                    className={`button-side colorButton ${layerType === 'bwInvert' ? 'active' : ''}`}
                    role="button"
                    onClick={() => { handleColorChange({ color: 'bwInvert', id: topstack.id, svgs: [topstack.svg, bottomstack.svg] }); setLayerType('bwInvert'); setChangeSelect('custom-setup') }}
                ><span className="text">Invert</span></button>
            </div>
        </>
    )
}

function SvgSideComponent({ active, setShowLayerManager }) {
    const { topstack, bottomstack, fullLayers, mainSvg, setMainSvg, setChangeSelect } = useGerberConfig();
    return (
        <>
            <div className="flex flex-row justify-center gap-2 bg-gray-800 p-2 rounded-lg border border-gray-700 inline-flex flex-nowrap whitespace-nowrap shadow-lg" style={{ pointerEvents: active ? 'auto' : 'none' }}>
                <button
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors whitespace-nowrap ${mainSvg.svg === fullLayers ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                    onClick={() => { setChangeSelect('custom-setup'); setMainSvg({ id: 'Full Layers', svg: fullLayers }) }}
                >
                    Full Stack
                </button>
                <div className="w-px bg-gray-600 mx-1 flex-shrink-0"></div>
                <button
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors whitespace-nowrap ${mainSvg.svg === topstack.svg ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                    onClick={() => { setChangeSelect('custom-setup'); setMainSvg({ id: 'top_layer', svg: topstack.svg }) }}
                >
                    Top
                </button>
                <button
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors whitespace-nowrap ${mainSvg.svg === bottomstack.svg ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                    onClick={() => { setChangeSelect('custom-setup'); setMainSvg({ id: 'bottom_layer', svg: bottomstack.svg }) }}
                >
                    Bottom
                </button>
                <div className="w-px bg-gray-600 mx-1 flex-shrink-0"></div>
                <button
                    className="px-3 py-1 text-sm font-medium rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors whitespace-nowrap"
                    onClick={() => setShowLayerManager(true)}
                >
                    Manage
                </button>
            </div>
        </>
    )
}


function RefreshButton({ dropAreaRef, resultRef, setIsAnimating, setActive }) {
    const { handleReset } = useGerberConfig();

    const handleResetButton = () => {
        setIsAnimating(true);
        setActive(false);
        setTimeout(() => {
            resultRef.current.innerHTML = ''
            resultRef.current.style.display = 'none';
            dropAreaRef.current.style.display = 'flex'
        }, 250);
        handleReset();
    }
    return (
        <>
            <div className="refreshButton">
                <button id="refreshBtn" onClick={handleResetButton} ><FontAwesomeIcon icon={faRotateRight} /><div>Refresh</div></button>
            </div>
        </>
    )
}


export function handleColorChange(props) {
    const svgColor = {
        'bw': `
            ${props.id}_fr4 {color: #000000  !important;}
            .${props.id}_cu {color: #ffffff !important;}
            .${props.id}_cf {color: #ffffff !important;}
            .${props.id}_sm {color: #ffffff; opacity: 0 !important;}
            .${props.id}_ss {color: #ffffff !important;}
            .${props.id}_sp {color: #ffffff !important;}
            .${props.id}_out {color: #000000 !important;}
        `,

        'bwInvert': `
            .${props.id}_fr4 {color: #ffffff  !important;}
            .${props.id}_cu {color: #000000 !important;}
            .${props.id}_cf {color: #000000 !important;}
            .${props.id}_sm {color: #ffffff; opacity: 0 !important;}
            .${props.id}_ss {color: #000000 !important;}
            .${props.id}_sp {color: #000000 !important;}
            .${props.id}_out {color: #ffffff !important;}
        `,

        'original': `
            .${props.id}_fr4 {color: #666666  !important;}
            .${props.id}_cu {color: #cccccc !important;}
            .${props.id}_cf {color: #cc9933 !important;}
            .${props.id}_sm {color: #004200 !important; opacity: 0.75 !important;}
            .${props.id}_ss {color: #ffffff !important;}
            .${props.id}_sp {color: #999999 !important;}
            .${props.id}_out {color: #000000 !important;}
        `
    }

    // console.log(props)
    props.svgs.forEach(svg => {
        const stackStyle = svg.querySelector('style');
        if (stackStyle) stackStyle.innerHTML = svgColor[props.color];
    })
}

function LayerManagerModal({ show, onClose }) {
    const { layers, setLayers, setTopStack, setBottomStack, setFullLayers, setMainSvg, setStackConfig } = useGerberConfig();
    const [tempLayers, setTempLayers] = useState([]);
    const [activeId, setActiveId] = useState(null);

    useEffect(() => {
        if (show && layers) {
            setTempLayers(layers.map(l => ({ ...l })));
        }
    }, [show, layers]);

    if (!show) return null;

    const handleSave = async () => {
        await reprocessStackup(tempLayers, setTopStack, setBottomStack, setFullLayers, setMainSvg, setStackConfig);
        setLayers(tempLayers);
        onClose();
    };

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const layerId = active.id;
        const targetContainer = over.id; // 'unassigned', 'top-copper', 'top-soldermask', etc.

        // Update layer type/side based on target container
        const updated = tempLayers.map(l => {
            if (l.id === layerId) {
                // Parse targetContainer to get new type and side
                // Format: 'side-type' or just 'unassigned'
                if (targetContainer === 'unassigned') {
                    return { ...l, enabled: false, type: 'unknown', side: 'all' }; // Or keep type?
                } else {
                    const [side, type] = targetContainer.split('-');
                    // Special case for 'general' which might be 'all-outline' or 'all-drill'
                    if (side === 'all') {
                        return { ...l, enabled: true, side: 'all', type: type };
                    }
                    return { ...l, enabled: true, side: side, type: type };
                }
            }
            return l;
        });

        // Ensure only one layer per slot (except Unassigned)?
        // If we drop into a slot that already has a layer, we should probably swap them or push the old one to unassigned?
        if (targetContainer !== 'unassigned') {
            const [side, type] = targetContainer.split('-');
            const currentLayerInSlot = tempLayers.find(l =>
                l.enabled !== false && l.side === side && l.type === type && l.id !== layerId
            );

            if (currentLayerInSlot) {
                // Move conflict to unassigned
                updated.forEach(l => {
                    if (l.id === currentLayerInSlot.id) {
                        l.enabled = false;
                        l.type = 'unknown'; // Optional reset
                    }
                });
            }
        }

        setTempLayers(updated);
    };

    // Helper to get layer in a slot
    const getLayer = (side, type) => tempLayers.find(l => l.side === side && l.type === type && l.enabled !== false);

    const getUnassigned = () => {
        const assignedIds = new Set();
        const slotDefinitions = [
            { side: 'top', type: 'copper' },
            { side: 'top', type: 'soldermask' }, // Pads
            { side: 'top', type: 'silkscreen' },
            { side: 'bottom', type: 'copper' },
            { side: 'bottom', type: 'soldermask' },
            { side: 'bottom', type: 'silkscreen' },
            { side: 'all', type: 'outline' },
            { side: 'all', type: 'drill' }
        ];

        slotDefinitions.forEach(def => {
            const layer = getLayer(def.side, def.type);
            if (layer) assignedIds.add(layer.id);
        });

        return tempLayers.filter(l => !assignedIds.has(l.id));
    };

    // Draggable Item Component
    const DraggableLayer = ({ layer, isOverlay }) => {
        const { attributes, listeners, setNodeRef, transform } = useDraggable({
            id: layer.id,
            data: { layer }
        });

        const style = transform ? {
            transform: CSS.Translate.toString(transform),
        } : undefined;

        // Compact styling
        const baseClass = "p-2 rounded border text-xs flex justify-between items-center cursor-move bg-gray-700 border-gray-600 hover:border-gray-400 mb-1";
        const overlayClass = "bg-blue-600 border-blue-400 shadow-xl opacity-90 z-50";

        return (
            <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`${baseClass} ${isOverlay ? overlayClass : ''}`}>
                <div className="overflow-hidden">
                    <div className="truncate font-medium text-white break-all" title={layer.filename}>
                        {layer.filename}
                    </div>
                </div>
                {!isOverlay && <FontAwesomeIcon icon={faRotateRight} className="text-gray-500 ml-2" size="xs" />}
            </div>
        );
    };

    // Droppable Slot Component
    const DroppableSlot = ({ id, label, side, type }) => {
        const { setNodeRef, isOver } = useDroppable({ id });
        const layer = getLayer(side, type);

        return (
            <div ref={setNodeRef} className={`p-2 rounded-lg border-2 border-dashed transition-colors min-h-[60px] flex flex-col justify-center ${isOver ? 'border-blue-500 bg-gray-750' : 'border-gray-600 bg-gray-800'}`}>
                <span className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">{label}</span>
                {layer ? (
                    <DraggableLayer layer={layer} />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-[10px] italic">
                        Empty
                    </div>
                )}
            </div>
        );
    };

    const DroppableUnassigned = () => {
        const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' });
        const layers = getUnassigned();

        return (
            <div ref={setNodeRef} className={`flex-1 overflow-y-auto p-3 rounded-xl border border-gray-700 transition ${isOver ? 'bg-gray-800 border-blue-500' : 'bg-gray-900'}`}>
                <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-3">Unassigned</h3>
                {layers.length === 0 && <p className="text-gray-500 text-xs italic">All layers placed.</p>}
                {layers.map(l => (
                    <DraggableLayer key={l.id} layer={l} />
                ))}
            </div>
        );
    };

    const activeLayer = activeId ? tempLayers.find(l => l.id === activeId) : null;

    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
            <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
                <div className="bg-gray-800 text-white rounded-lg shadow-2xl border border-gray-600 w-full max-w-7xl h-[95vh] flex flex-col">
                    <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-lg">
                        <h2 className="text-lg font-bold tracking-wide">Layer Assignment</h2>
                    </div>

                    <div className="flex-1 overflow-hidden p-4 flex gap-4">
                        {/* Left: Unassigned */}
                        <div className="w-1/3 flex flex-col">
                            <DroppableUnassigned />
                        </div>

                        {/* Middle & Right Wrapper */}
                        <div className="w-2/3 flex flex-col gap-3 overflow-y-auto custom-scrollbar">

                            {/* Top & Bottom Columns */}
                            <div className="grid grid-cols-2 gap-3 bg-gray-900 p-3 rounded-xl border border-gray-700">
                                {/* Top Column */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 border-b border-gray-700 pb-1 mb-1">
                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                        <h3 className="text-sm font-semibold">Top Layer</h3>
                                    </div>
                                    <DroppableSlot id="top-copper" side="top" type="copper" label="Copper" />
                                    <DroppableSlot id="top-soldermask" side="top" type="soldermask" label="Pads (Mask)" />
                                    <DroppableSlot id="top-silkscreen" side="top" type="silkscreen" label="Silkscreen" />
                                </div>

                                {/* Bottom Column */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2 border-b border-gray-700 pb-1 mb-1">
                                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                        <h3 className="text-sm font-semibold">Bottom Layer</h3>
                                    </div>
                                    <DroppableSlot id="bottom-copper" side="bottom" type="copper" label="Copper" />
                                    <DroppableSlot id="bottom-soldermask" side="bottom" type="soldermask" label="Pads (Mask)" />
                                    <DroppableSlot id="bottom-silkscreen" side="bottom" type="silkscreen" label="Silkscreen" />
                                </div>
                            </div>

                            {/* General Layers Section - Below Top/Bottom */}
                            <div className="bg-gray-900 p-3 rounded-xl border border-gray-700">
                                <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-2">General / Board</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <DroppableSlot id="all-outline" side="all" type="outline" label="Edge Cuts / Outline" />
                                    <DroppableSlot id="all-drill" side="all" type="drill" label="Drill Holes" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-3 border-t border-gray-700 bg-gray-900 flex justify-end gap-3 rounded-b-lg">
                        <button className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors text-sm" onClick={onClose}>Cancel</button>
                        <button className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white shadow-lg font-bold text-sm" onClick={handleSave}>Apply & Render</button>
                    </div>
                </div>

                <DragOverlay>
                    {activeLayer ? <DraggableLayer layer={activeLayer} isOverlay /> : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
}
