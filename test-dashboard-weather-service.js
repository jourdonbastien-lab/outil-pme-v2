'use strict';
const assert=require('assert'),{createDashboardWeatherService,weatherConditionLabel,roundWeatherValue}=require('./services/dashboardWeatherService');
class FakeAbortController{constructor(){this.signal={token:'signal'};this.aborted=false}abort(){this.aborted=true}}
async function run(){
 let requested,timerDelay,cleared;
 const service=createDashboardWeatherService({fetch:async(url,options)=>{requested={url,options};return{ok:true,json:async()=>({current:{temperature_2m:12.6,weather_code:0,wind_speed_10m:18.4,precipitation:1.26},daily:{time:['2026-08-03','2026-08-04'],weather_code:[1,61],temperature_2m_max:[20.4,19.6],temperature_2m_min:[8.4,9.6],precipitation_sum:[1.26,2.34],wind_speed_10m_max:[22.2,24.8]}})}} ,AbortController:FakeAbortController,setTimeout:(fn,delay)=>{timerDelay=delay;return 7},clearTimeout:id=>{cleared=id}});
 const result=await service.getWeather();assert.strictEqual(result.statusCode,200);assert.strictEqual(result.body.location,'Riaillé');assert.deepStrictEqual(result.body.current,{temperature:13,condition:'Ciel dégagé',precipitation:1.3,wind:18});assert.strictEqual(result.body.today.precipitation,1.3);assert.strictEqual(timerDelay,4500);assert.strictEqual(cleared,7);assert(requested.url.startsWith('https://api.open-meteo.com/v1/forecast?'));for(const value of ['latitude=47.52','longitude=-1.29','timezone=Europe%2FParis','forecast_days=2','current=temperature_2m%2Cweather_code%2Cwind_speed_10m%2Cprecipitation','daily=weather_code%2Ctemperature_2m_max%2Ctemperature_2m_min%2Cprecipitation_sum%2Cwind_speed_10m_max'])assert(requested.url.includes(value),value);assert.deepStrictEqual(requested.options.headers,{Accept:'application/json'});
 const make=fetch=>createDashboardWeatherService({fetch,AbortController:FakeAbortController,setTimeout:()=>1,clearTimeout:()=>{}});
 assert.strictEqual((await make(async()=>({ok:false})).getWeather()).statusCode,502);
 assert.strictEqual((await make(async()=>{throw new Error('network')}).getWeather()).statusCode,503);
 assert.strictEqual((await make(async()=>({ok:true,json:async()=>{throw new Error('json')}})).getWeather()).statusCode,503);
 const missing=await make(async()=>({ok:true,json:async()=>({})})).getWeather();assert.strictEqual(missing.statusCode,200);assert.strictEqual(missing.body.current.temperature,null);assert.strictEqual(missing.body.today.date,null);
 let abortController;class CapturedAbort extends FakeAbortController{constructor(){super();abortController=this}}
 let timeoutFn;const timeoutService=createDashboardWeatherService({fetch:async()=>{timeoutFn();throw new Error('aborted')},AbortController:CapturedAbort,setTimeout:fn=>{timeoutFn=fn;return 2},clearTimeout:()=>{}});assert.strictEqual((await timeoutService.getWeather()).statusCode,503);assert.strictEqual(abortController.aborted,true);
 assert.strictEqual(weatherConditionLabel(95),'Orage');assert.strictEqual(weatherConditionLabel(999),'Météo variable');assert.strictEqual(roundWeatherValue('x'),null);
 console.log('OK - service météo Dashboard');
}run().catch(error=>{console.error(error);process.exitCode=1});
