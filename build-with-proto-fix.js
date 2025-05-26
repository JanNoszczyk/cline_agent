const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Clean dist/proto before build
const distProto = path.join(__dirname, 'dist', 'proto');
if (fs.existsSync(distProto)) {
    fs.rmSync(distProto, { recursive: true, force: true });
    console.log('Cleaned dist/proto before build');
}

// Run the actual build
const args = process.argv.slice(2);
const build = spawn('node', ['esbuild.js', ...args], { 
    stdio: 'inherit',
    cwd: __dirname 
});

build.on('exit', (code) => {
    process.exit(code || 0);
});
