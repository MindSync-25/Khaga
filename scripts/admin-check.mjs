import {checkManagementSetup} from '../src/management/diagnostics.mjs';
// Use an operator-controlled terminal with environment supplied securely.
// Never pass passwords or API keys as command arguments or paste them in chat.
const result=await checkManagementSetup();
console.log(JSON.stringify(result,null,2));
process.exitCode=result.ok?0:1;
