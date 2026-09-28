import {startApplication} from './src/bootstrap.mjs';
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer between 1 and 65535.');
const app=await startApplication({port});
app.server.on('error',()=>{console.error('KHAGA server listener failed. Check the hosting port configuration.');process.exit(1);});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
  const timer=setTimeout(()=>process.exit(1),5000);timer.unref();
  app.close().then(()=>{clearTimeout(timer);process.exit(0);},()=>process.exit(1));
});
