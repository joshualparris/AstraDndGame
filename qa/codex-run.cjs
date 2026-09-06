'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
const suites=['combat-parity','ai-adversarial','save-compat','long-campaign','rules-parity','provider-failures'];
if(process.env.SOURCE_AIDM_ROOT)suites.push('source-comparison');
if(process.argv.includes('--browser'))suites.push('browser-regression');
let failed=0,total=0,passed=0;
for(const name of suites){const r=spawnSync(process.execPath,[path.join(__dirname,'codex-'+name+'.cjs')],{encoding:'utf8',env:process.env,timeout:180000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');const line=(r.stdout||'').trim().split('\n').at(-1);try{const counts=JSON.parse(line);total+=counts.total;passed+=counts.passed;failed+=counts.failed}catch{failed++;console.error('Suite did not complete: '+name,r.error?.message||'')}if(r.status!==0&&!failed)failed++}
console.log(JSON.stringify({total,passed,failed}));if(failed)process.exitCode=1;
