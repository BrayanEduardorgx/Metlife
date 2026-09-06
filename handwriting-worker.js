// Runs entirely on the device. Only model weights are downloaded; pixels are not uploaded.
import { pipeline, env, RawImage } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
let model;
self.onmessage=async ({data})=>{
  const {id,pixels,width,height}=data;
  try{
    model ||= pipeline('image-to-text','Xenova/trocr-small-handwritten',{quantized:true,progress_callback:event=>{
      if(event.status==='progress')self.postMessage({id,progress:Math.round(event.progress||0)});
    }}).catch(error=>{model=null;throw error;});
    const reader=await model;const image=new RawImage(new Uint8ClampedArray(pixels),width,height,4);
    const output=await reader(image,{max_new_tokens:64,num_beams:1});
    self.postMessage({id,text:output[0]?.generated_text||''});
  }catch{self.postMessage({id,error:'No se pudo cargar o ejecutar el lector de letra a mano. Prueba Lectura rápida o corrige el campo manualmente.'});}
};
