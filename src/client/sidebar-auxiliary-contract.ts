/** Compile-time declaration for the sidebar panel slot introduced in DSH Web rc.7. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.auxiliary': {
      kind: 'single'
      scope: 'root'
      owner: { readonly wide: boolean }
    }
  }
}

export {}
