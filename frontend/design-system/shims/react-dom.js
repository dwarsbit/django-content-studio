// react-dom over the page's window.ReactDOM (React 18 UMD).
const ReactDOM = window.ReactDOM;
export default ReactDOM;
export const { createPortal, flushSync, findDOMNode, unstable_batchedUpdates } =
  ReactDOM;
