'use strict';
const assert=require('assert'),fs=require('fs'),{registerDashboardRoutes}=require('./routes/dashboard');
const calls=[],app={get:(url,middleware,handler)=>calls.push(['GET',url,middleware,handler])},login=()=>{};
const dashboardController={showClassicDashboard(){},showDashboard(){},redirectDashboardPrototype(){},redirectDashboardPrototypeLegacy(){}},weatherController={getWeather(){}};
registerDashboardRoutes(app,{requireLogin:login,dashboardController,weatherController});
assert.deepStrictEqual(calls.map(x=>x.slice(0,2)),[['GET','/dashboard/classic'],['GET','/dashboard'],['GET','/dashboard-prototype'],['GET','/dashboard/prototype'],['GET','/api/weather']]);
assert(calls.every(x=>x[2]===login));assert.strictEqual(new Set(calls.map(x=>x[0]+' '+x[1])).size,5);
const source=fs.readFileSync('routes/dashboard.js','utf8');assert(!/SELECT |<section|<script|open-meteo|fetch\(/.test(source));
console.log('OK - routes Dashboard');
