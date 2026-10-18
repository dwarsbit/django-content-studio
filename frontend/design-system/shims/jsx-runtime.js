// react/jsx-runtime over the page's window.React (React 18 UMD).
const React = window.React;

function props(config, key) {
  const { children, ...rest } = config || {};
  if (key !== undefined) rest.key = key;
  return [rest, children];
}

export const Fragment = React.Fragment;

export function jsx(type, config, key) {
  const [rest, children] = props(config, key);
  return children === undefined
    ? React.createElement(type, rest)
    : React.createElement(type, rest, children);
}

export function jsxs(type, config, key) {
  const [rest, children] = props(config, key);
  return React.createElement(type, rest, ...(children || []));
}
