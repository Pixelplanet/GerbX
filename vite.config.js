import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// pcb-stackup / gerber-to-svg only ship UMD "var" bundles that assign a
// top-level variable; this gives them a default export so they can be imported.
const UMD_GLOBALS = {
  'pcb-stackup/dist/pcb-stackup.min.js': 'pcbStackup',
  'gerber-to-svg/dist/gerber-to-svg.min.js': 'gerberToSvg',
}

function umdDefaultExport() {
  return {
    name: 'umd-default-export',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/')
      for (const [suffix, global] of Object.entries(UMD_GLOBALS)) {
        if (normalized.endsWith(suffix)) {
          return { code: `${code}\nexport default ${global};`, map: null }
        }
      }
      return null
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [umdDefaultExport(), react()],
  optimizeDeps: {
    exclude: ['pcb-stackup', 'gerber-to-svg'],
  },
})
