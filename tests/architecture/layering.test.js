import { test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walkDir(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.resolve(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

test('Layering Rule 1: No file under src/lib/** imports @/stores or @/services', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const libFiles = walkDir(path.join(srcDir, 'lib'));
    
    const violations = [];
    for (const file of libFiles) {
        if (!file.match(/\.(js|ts|svelte)$/)) continue;
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match static imports
            if (line.match(/from\s+['"](?:@\/|\.\.\/|\.\.\/\.\.\/)(stores|services)/) || line.match(/^import\s+['"](?:@\/|\.\.\/|\.\.\/\.\.\/)(stores|services)/)) {
                violations.push(`${file}:${i + 1} - ${line.trim()}`);
            }
        }
    }
    expect(violations, `Found files in src/lib importing from stores or services:\n${violations.join('\n')}`).toEqual([]);
});

test('Layering Rule 2: No file under src/services/** imports @/stores, except stores/settingsStore', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const servicesFiles = walkDir(path.join(srcDir, 'services'));
    
    const violations = [];
    for (const file of servicesFiles) {
        if (!file.match(/\.(js|ts|svelte)$/)) continue;
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.match(/from\s+['"](?:@\/|\.\.\/|\.\.\/\.\.\/)stores/) || line.match(/^import\s+['"](?:@\/|\.\.\/|\.\.\/\.\.\/)stores/)) {
                if (!line.includes('settingsStore')) {
                    violations.push(`${file}:${i + 1} - ${line.trim()}`);
                }
            }
        }
    }
    expect(violations, `Found files in src/services importing from stores (other than settingsStore):\n${violations.join('\n')}`).toEqual([]);
});

test('Layering Rule 3: No file under lib|services|stores imports @/entrypoints', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const libFiles = walkDir(path.join(srcDir, 'lib'));
    const servicesFiles = walkDir(path.join(srcDir, 'services'));
    const storesFiles = walkDir(path.join(srcDir, 'stores'));
    
    const allCoreFiles = [...libFiles, ...servicesFiles, ...storesFiles];
    const violations = [];
    
    for (const file of allCoreFiles) {
        if (!file.match(/\.(js|ts|svelte)$/)) continue;
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.match(/from\s+['"](?:@\/|\.\.\/|\.\.\/\.\.\/|\.\.\/\.\.\/\.\.\/)entrypoints/) || line.match(/^import\s+['"](?:@\/|\.\.\/|\.\.\/\.\.\/|\.\.\/\.\.\/\.\.\/)entrypoints/)) {
                violations.push(`${file}:${i + 1} - ${line.trim()}`);
            }
        }
    }
    expect(violations, `Found core files importing from entrypoints:\n${violations.join('\n')}`).toEqual([]);
});

test('Component Rule 4: No two .svelte files share a basename across src/components/** and src/lib/**', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const componentsFiles = walkDir(path.join(srcDir, 'components')).filter(f => f.endsWith('.svelte')).map(f => path.basename(f));
    const libFiles = walkDir(path.join(srcDir, 'lib')).filter(f => f.endsWith('.svelte')).map(f => path.basename(f));
    
    const componentsBasenames = new Set(componentsFiles);
    const violations = [];
    for (const libFile of libFiles) {
        if (componentsBasenames.has(libFile)) {
            violations.push(libFile);
        }
    }
    expect(violations, `Found duplicate .svelte basenames across components/ and lib/:\n${violations.join('\n')}`).toEqual([]);
});
