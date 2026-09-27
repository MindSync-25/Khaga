import {hashPassword} from '../src/management/security.mjs';
import {emitKeypressEvents} from 'node:readline';
if(!process.stdin.isTTY){console.error('Run this in an interactive terminal; do not pass passwords as command-line arguments.');process.exit(1);}
console.log('Create the KHAGA owner password hash. Your password is not echoed or stored.');
async function secret(prompt){process.stdout.write(prompt);emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();return new Promise((resolve,reject)=>{let value='';const onKey=(str,key)=>{if(key?.ctrl&&key.name==='c'){process.stdin.setRawMode(false);process.exit(1);}if(key?.name==='return'){process.stdin.off('keypress',onKey);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return;}if(key?.name==='backspace'){value=value.slice(0,-1);return;}if(!key?.ctrl&&!key?.meta&&str)value+=str;};process.stdin.on('keypress',onKey);});}
const password=await secret('Password (minimum 16 characters): '),confirm=await secret('Repeat password: ');
if(password!==confirm){console.error('Passwords did not match.');process.exit(1);}
console.log('\nSet ADMIN_PASSWORD_HASH in Hostinger to this value (not in GitHub):\n'+await hashPassword(password));
