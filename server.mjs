import {createApp} from './src/app.mjs';
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer between 1 and 65535.');
const server=createApp();
server.listen(port,'0.0.0.0',()=>console.log(`KHAGA preview running on port ${port}. Checkout is disabled.`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();});
server.on('error',error=>{console.error(error.message);process.exit(1);});
