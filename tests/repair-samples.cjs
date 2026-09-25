const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({Date});vm.runInContext(fs.readFileSync('repair-samples.js','utf8'),context);
const existing={id:'REAL-1',home:'h1',status:'รับเรื่อง',detail:'รายการลูกบ้าน'};
const data={home:'h1',profile:{phone:'0812345678'},repairs:[existing]};
assert.equal(context.addRepairSamples(data),true);
assert.equal(data.repairs.length,9);assert.strictEqual(data.repairs[0],existing);
assert.equal(context.addRepairSamples(data),false);assert.equal(data.repairs.length,9);
assert.equal(new Set(data.repairs.filter(r=>r.demo).map(r=>r.status)).size,6);
for(const r of data.repairs.filter(r=>r.demo)){
 const dates=[r.createdAt,r.acceptedAt,r.progress?.date,r.closedAt].filter(Boolean).map(Date.parse);
 assert(dates.every((d,i)=>!i||d>=dates[i-1]));
 for(const photo of [...r.photos,...(r.resolution?.photos||[])])assert(fs.existsSync(photo));
}
console.log('Mock migration passed: preserves existing records, runs once, covers all six statuses, valid chronology and local images.');
