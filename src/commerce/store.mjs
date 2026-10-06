export class CommerceStore {
 constructor(repo,mode){this.repo=repo;this.mode=mode;}
 call(action,args={}){return this.repo.rpc('commerce',{p_mode:this.mode,p_action:action,p_args:args});}
 policy(){return this.call('policy');}
 get(id){return this.call('get',{id});}
 find(provider){return this.call('find',{provider});}
 list(guest=null,offset=0){return this.call('list',{guest,offset});}
 create(order){return this.call('create',order);}
 bind(id,provider){return this.call('bind',{id,provider});}
 state(id,status){return this.call('state',{id,status});}
 mark(id,payment,event=null){return this.call('mark',{id,payment,event});}
}
