const test=require('node:test');
const assert=require('node:assert/strict');
const {createProductTextLookup}=require('../background/idosellProductTexts');
test('Catalog text language, cache isolation and unavailable translations',async()=>{
 let baseUrl='https://shop.example',calls=[];
 const lookup=createProductTextLookup({settings:()=>({baseUrl,enabled:true,apiKey:'test'}),url:(b,p)=>`${b}/${p}`,request:async(url,options)=>{
  calls.push({url,options});
  return {response:{ok:true},json:{results:[{productId:42,productDescriptionsLangData:[{langId:'ger',productName:'Deutscher Name'},{langId:'pol',productName:'Polska nazwa'}]}]}};
 }});
 const ids=['42','43'];
 assert.deepEqual(await lookup({productIds:ids,language:'de'}),{texts:{42:'Deutscher Name'},missing:['43']});
 assert.equal(calls[0].options.body.params.productSearchingLangId,'ger');
 assert.deepEqual(calls[0].options.body.params.returnElements,['lang_data']);
 await lookup({productIds:['42'],language:'de'});assert.equal(calls.length,1);
 assert.equal((await lookup({productIds:['42'],language:'pl'})).texts[42],'Polska nazwa');
 baseUrl='https://other.example';await lookup({productIds:['42'],language:'de'});assert.equal(calls.length,3);
 assert.deepEqual(ids,['42','43']);
 await assert.rejects(lookup({productIds:['42'],language:'unknown'}));
});
test('API failures remain errors for the UI original-text fallback',async()=>{
 const lookup=createProductTextLookup({settings:()=>({enabled:true,apiKey:'test',baseUrl:'https://shop.example'}),url:()=>'',request:async()=>({response:{ok:false,status:403}})});
 await assert.rejects(lookup({productIds:['42'],language:'de'}),/403/);
});
