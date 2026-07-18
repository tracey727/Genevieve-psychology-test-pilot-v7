"use client";

import { useCallback, useEffect, useState } from "react";

export function usePersistentView(scope:string,initial:string){
  const [view,setViewState]=useState(initial);
  useEffect(()=>{
    const apply=()=>{
      const fromUrl=new URLSearchParams(window.location.search).get("view");
      const stored=window.localStorage.getItem(`genevieve-view-${scope}`);
      setViewState(fromUrl||stored||initial);
    };
    const timer=setTimeout(apply,0);
    window.addEventListener("popstate",apply);
    return()=>{clearTimeout(timer);window.removeEventListener("popstate",apply)};
  },[initial,scope]);
  const setView=useCallback((next:string)=>{
    setViewState(next);window.localStorage.setItem(`genevieve-view-${scope}`,next);
    const url=new URL(window.location.href);url.searchParams.set("view",next);window.history.pushState({view:next},"",url);
  },[scope]);
  return [view,setView] as const;
}
