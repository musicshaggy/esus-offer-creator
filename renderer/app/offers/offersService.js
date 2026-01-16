function api(){
  if(!window.esusAPI) throw new Error("Brak esusAPI");
  return window.esusAPI;
}

export const offersService = {
  getLast: ()=>api().offersGetLast(),
  list: ()=>api().offersList(),
  new: ()=>api().offersNew(),
  open: (id)=>api().offersOpen(id),
  save: (p)=>api().offersSave(p),
  delete: (id)=>api().offersDelete(id),
  duplicate: (id)=>api().offersDuplicate(id),
};
