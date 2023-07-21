// Started based on react-native-svg-uri, then rewritten in more functional
// fashion to be easier to maintain and be faster, with less copies
//
// It will parse the XML only once and create a SVGRenderNode tree with pre-processed
// props and the desired react-native-svg component.
//
// On render it will call getFinalSVGProps() so width, height and color can be applied
// to the image (colors are overridden, not tinted/blended)

// This is a little bit of a band-aid since react-native-svg can't read contents of a file
// and react-native-svg-uri doesn't work properly on Android

import * as React from 'react';
import isEqual from 'lodash/isEqual';

import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  ImageSourcePropType,
  Animated,
} from 'react-native';
import xmldom from 'xmldom';
import resolveAssetSource from 'react-native/Libraries/Image/resolveAssetSource';

import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  LinearGradient,
  RadialGradient,
  Path,
  Polygon,
  Rect,
  Defs,
  Stop,
  Use,
  Symbol,
} from 'react-native-svg';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
const AnimatedRadialGradient = Animated.createAnimatedComponent(RadialGradient);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedDefs = Animated.createAnimatedComponent(Defs);
const AnimatedStop = Animated.createAnimatedComponent(Stop);
const AnimatedUse = Animated.createAnimatedComponent(Use);
const AnimatedSymbol = Animated.createAnimatedComponent(Symbol);
interface SVGAttrProcessorMap {
  [label: string]: (attr: string) => string;
}

interface SVGElementProcessor {
  attributes: SVGAttrProcessorMap;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>;
  getExtendedProps?: <T extends {}>(
    arg0: T,
    arg1: SVGIconStyle,
  ) => { extProps: SVGIconStyle; needExtProps: boolean };
}

interface SVGRenderNode {
  children: SVGRenderNode[] | null;
  processor: SVGElementProcessor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: StyleProp<any>;
}

interface SVGNodeAttribute {
  nodeName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeValue: any;
}

interface SVGNode {
  attributes: SVGNodeAttribute[];
  childNodes: SVGNode[] | null;
  nodeName: string;
}

export interface SVGIconStyle extends ViewStyle {
  color?: string;
  fill?: string;
  fillColor?: string;
  overlay?: string;
  stroke?: string;
}

const utils = {
  addSVGPropsFromStyle: (
    style: string,
    processorMap: SVGAttrProcessorMap,
    node: SVGNode,
  ): React.ReactPropTypes => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props: any = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    style.split(';').forEach((entry: string): any => {
      const [styleName, styleValue] = entry.split(':');
      const propName = utils.dashToCamelCase(styleName.trim());
      if (propName) {
        const processor = processorMap[propName];
        if (processor) {
          props[propName] = processor(styleValue.trim());
        } else if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn(
            'ignored SVG style attribute entry:',
            propName,
            'of',
            node.nodeName,
            'in',
            node.toString(),
          );
        }
      }
    });
    return props;
  },

  createSVGRenderNode: (
    processor: SVGElementProcessor,
    node: SVGNode,
    children: SVGRenderNode[] | null,
    key: number | null,
  ): SVGRenderNode | null => {
    const { attributes } = processor;
    const props = utils.getSVGProps(node, attributes, key);
    return { children, processor, props };
  },

  dashToCamelCase: (value: string): string =>
    value.replace(/-([a-z])/g, (g: string): string => g[1].toUpperCase()),

  fetchText: async (uri: string): Promise<string | null> => {
    try {
      const response = await fetch(uri);
      return response.text();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Error: could not fetch', uri, e);
      return null;
    }
  },

  getSVG: (icon: string): string => {
    if (icon.startsWith('<svg ')) {
      return icon;
    }
    return icon.substring(icon.indexOf('<svg '), icon.indexOf('</svg>') + 6);
  },

  getSVGProps: (
    node: SVGNode,
    processorMap: SVGAttrProcessorMap,
    key: number | null,
  ): React.ReactPropTypes => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props: any = {};
    const { attributes } = node;
    for (let i = 0; i < attributes.length; i += 1) {
      const { nodeName, nodeValue } = attributes[i];
      const propName = utils.dashToCamelCase(nodeName);
      const processor = processorMap[propName];
      if (processor) {
        props[propName] = processor(nodeValue);
      } else if (propName === 'style') {
        Object.assign(
          props,
          utils.addSVGPropsFromStyle(nodeValue, processorMap, node),
        );
      } else if (__DEV__ && propName !== 'xmlns') {
        // eslint-disable-next-line no-console
        console.warn(
          'ignored SVG attribute:',
          propName,
          'of',
          node.nodeName,
          'in',
          node.toString(),
        );
      }
    }
    if (key !== undefined) {
      props.key = key;
    }
    return props;
  },

  parseSVG: (xml: string | null): SVGRenderNode | null => {
    if (!xml) {
      return null;
    }
    try {
      const inputSVG = utils.getSVG(xml);
      const doc: Document = new xmldom.DOMParser().parseFromString(inputSVG);
      // Document wasn't properly declared
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return utils.processSVGNode((doc as any).childNodes[0], null);
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line
        console.error('ERROR SVG', e);
      }
      return null;
    }
  },

  passThruValue: (value: string): string => value,

  pixelValue: (value: string): string => value.replace(/(\d+)\s*px/g, '$1'),

  processSVGNode: (node: SVGNode, key: number | null): SVGRenderNode | null => {
    const { nodeName } = node;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const elementProcessor = SVGElementProcessorMap[nodeName];
    if (!elementProcessor) {
      if (__DEV__ && nodeName !== '#text') {
        // eslint-disable-next-line no-console
        console.warn('ignored unsupported SVG element:', node.toString());
      }
      return null;
    }

    let arrayElements: SVGRenderNode[] | null = null;

    if (node.childNodes && node.childNodes.length > 0) {
      for (let i = 0; i < node.childNodes.length; i += 1) {
        const childNode = utils.processSVGNode(node.childNodes[i], i);
        if (childNode) {
          if (!arrayElements) {
            arrayElements = [childNode];
          } else {
            arrayElements.push(childNode);
          }
        }
      }
    }

    return utils.createSVGRenderNode(
      elementProcessor,
      node,
      arrayElements,
      key,
    );
  },
};

const withDefs = <T extends {}>(
  Component: React.ComponentType<T>,
): ((props: T) => JSX.Element) => {
  const wrapper = (props: T): JSX.Element => (
    <Defs>
      <Component {...props} />
    </Defs>
  );
  const displayName = Component.displayName || Component.name;
  wrapper.displayName = `withDefs(${displayName})`;
  return wrapper;
};

const CommonAttrs: SVGAttrProcessorMap = {
  clipRule: utils.passThruValue,
  fill: utils.passThruValue,
  fillOpacity: utils.passThruValue,
  fillRule: utils.passThruValue,
  id: utils.passThruValue,
  opacity: utils.passThruValue,
  origin: utils.pixelValue,
  originX: utils.pixelValue,
  originY: utils.pixelValue,
  rotate: utils.passThruValue,
  scale: utils.passThruValue,
  stroke: utils.passThruValue,
  strokeDasharray: utils.pixelValue,
  strokeDashoffset: utils.pixelValue,
  strokeLinecap: utils.passThruValue,
  strokeLinejoin: utils.passThruValue,
  strokeMiterlimit: utils.passThruValue,
  strokeOpacity: utils.passThruValue,
  strokeWidth: utils.pixelValue,
  transform: utils.passThruValue,
  x: utils.pixelValue,
  y: utils.pixelValue,
};

const SVGElementProcessorMap: {
  [label: string]: SVGElementProcessor;
} = {
  circle: {
    attributes: {
      ...CommonAttrs,
      cx: utils.pixelValue,
      cy: utils.pixelValue,
      r: utils.pixelValue,
    },
    component: AnimatedCircle,
  },
  defs: {
    attributes: {},
    component: AnimatedDefs,
  },
  ellipse: {
    attributes: {
      ...CommonAttrs,
      cx: utils.pixelValue,
      cy: utils.pixelValue,
      rx: utils.pixelValue,
      ry: utils.pixelValue,
    },
    component: AnimatedEllipse,
  },
  g: {
    attributes: {
      ...CommonAttrs,
    },
    component: AnimatedG,
  },
  line: {
    attributes: {
      ...CommonAttrs,
      x1: utils.pixelValue,
      x2: utils.pixelValue,
      y1: utils.pixelValue,
      y2: utils.pixelValue,
    },
    component: AnimatedLine,
  },
  linearGradient: {
    attributes: {
      ...CommonAttrs,
      x1: utils.pixelValue,
      x2: utils.pixelValue,
      y1: utils.pixelValue,
      y2: utils.pixelValue,
    },
    component: withDefs(AnimatedLinearGradient),
  },
  path: {
    attributes: {
      ...CommonAttrs,
      d: utils.passThruValue,
    },
    component: AnimatedPath,
  },
  polygon: {
    attributes: {
      ...CommonAttrs,
      points: utils.passThruValue,
    },
    component: AnimatedPolygon,
  },
  radialGradient: {
    attributes: {
      ...CommonAttrs,
      cx: utils.pixelValue,
      cy: utils.pixelValue,
      gradientTransform: utils.passThruValue,
      gradientUnits: utils.passThruValue,
      r: utils.pixelValue,
    },
    component: withDefs(AnimatedRadialGradient),
  },
  rect: {
    attributes: {
      ...CommonAttrs,
      height: utils.pixelValue,
      rx: utils.pixelValue,
      ry: utils.pixelValue,
      width: utils.pixelValue,
    },
    component: AnimatedRect,
  },
  stop: {
    attributes: {
      ...CommonAttrs,
      offset: utils.pixelValue,
      stopColor: utils.passThruValue,
      stopOpacity: utils.passThruValue,
    },
    component: AnimatedStop,
  },
  svg: {
    attributes: {
      ...CommonAttrs,
      height: utils.pixelValue,
      viewBox: utils.passThruValue,
      width: utils.pixelValue,
    },
    component: AnimatedSvg,
    getExtendedProps: (
      props: { height?: number; viewBox?: string; width?: number },
      style: SVGIconStyle,
    ): { extProps: SVGIconStyle; needExtProps: boolean } => {
      const { width: attrWidth, height: attrHeight, viewBox = '' } = props;
      const [, , viewWidth, viewHeight] = viewBox
        .split(/\s+/)
        .map((piece: string): number => parseInt(piece, 10));
      let { width, height } = style;
      if (!width || width < 0) {
        width = attrWidth || viewWidth;
      }
      if (!height || height < 0) {
        height = attrHeight || viewHeight;
      }
      const extProps: SVGIconStyle = {};
      let needExtProps = false;
      if (width && width > 0 && width !== attrWidth) {
        extProps.width = width;
        needExtProps = true;
      }
      if (height && height > 0 && height !== attrHeight) {
        extProps.height = height;
        needExtProps = true;
      }
      return { extProps, needExtProps };
    },
  },
  symbol: {
    attributes: {
      ...CommonAttrs,
      height: utils.pixelValue,
      viewBox: utils.passThruValue,
      width: utils.pixelValue,
    },
    component: AnimatedSymbol,
  },
  use: {
    attributes: {
      ...CommonAttrs,
      height: utils.pixelValue,
      href: utils.passThruValue,
      width: utils.pixelValue,
    },
    component: AnimatedUse,
  },
};

interface Props {
  fill: boolean;
  icon: string | null;
  source: ImageSourcePropType | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style: StyleProp<any> | null;
  testId?: string;
}

const emptySource = { uri: null };

const useResolvedSourceURI = (
  source: ImageSourcePropType | null | undefined,
): string | null =>
  React.useMemo(
    (): string | null =>
      ((source && resolveAssetSource(source)) || emptySource).uri || null,
    [source],
  );

const useResolvedStyles = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  propStyle: StyleProp<any> | null,
): { componentStyle: SVGIconStyle; style: SVGIconStyle } => {
  // styles are often given as objects/array and will change on every render
  // even if their contents do not. Then do a deep-compare to check if they
  // really changed
  const ref = React.useRef(propStyle);
  if (ref.current !== propStyle && !isEqual(ref.current, propStyle)) {
    ref.current = propStyle;
  }
  const { current: lastPropStyle } = ref;

  return React.useMemo((): {
    componentStyle: SVGIconStyle;
    style: SVGIconStyle;
  } => {
    const style: SVGIconStyle = Object.assign(
      {},
      StyleSheet.flatten(lastPropStyle || {}),
    );
    const { width, height } = style;
    const componentStyle: SVGIconStyle = { fillColor: '', height, width };
    if (style.color) {
      componentStyle.fillColor = style.color;
      delete style.color;
    }
    return { componentStyle, style };
  }, [lastPropStyle]);
};

const useParsedSVG = (document: string | null): SVGRenderNode | null =>
  React.useMemo((): SVGRenderNode | null => utils.parseSVG(document), [
    document,
  ]);

interface FinalSVGOptions {
  forceFill: boolean;
  style: SVGIconStyle;
}

const getFinalSVGProps = (
  renderNode: SVGRenderNode,
  { forceFill, style }: FinalSVGOptions,
  index: number,
): React.ReactPropTypes => {
  const {
    props: nodeProps,
    processor: { getExtendedProps },
  } = renderNode;
  const overlay: SVGIconStyle = {};

  const { fillColor } = style;
  if (fillColor) {
    if ((nodeProps.fill && nodeProps.fill !== 'none') || forceFill) {
      overlay.fill = fillColor;
    }
    if (nodeProps.stroke && nodeProps.stroke !== 'none') {
      overlay.stroke = fillColor;
    }
  }

  if (getExtendedProps) {
    const { extProps, needExtProps } = getExtendedProps(nodeProps, style);
    if (needExtProps) {
      Object.assign(overlay, extProps);
    }
  }

  return { key: index.toString(), ...nodeProps, ...overlay };
};

const SVGIcon = (props: Props): JSX.Element | null => {
  const { fill: forceFill, icon, source, style: propStyle, testId } = props;
  const { componentStyle, style } = useResolvedStyles(propStyle);

  const uri = useResolvedSourceURI(source);
  const [document, setDocument] = React.useState(icon);
  React.useEffect((): (() => void) => {
    let isMounted = true;
    setDocument(icon);
    if (uri) {
      utils.fetchText(uri).then((doc: string | null): void => {
        if (isMounted) {
          setDocument(doc);
        }
      });
    }
    return (): void => {
      isMounted = false;
    };
  }, [icon, uri]);

  const svg = useParsedSVG(document);
  return React.useMemo((): JSX.Element | null => {
    if (!svg) {
      return null;
    }

    const options: FinalSVGOptions = { forceFill, style: componentStyle };
    const renderSVG = (node: SVGRenderNode, index: number): JSX.Element => {
      const {
        children,
        processor: { component },
      } = node;
      return React.createElement(
        component,
        getFinalSVGProps(node, options, index),
        children ? children.map(renderSVG) : undefined,
      );
    };
    return (
      <View style={style} testID={testId}>
        {renderSVG(svg, 0)}
      </View>
    );
  }, [svg, forceFill, componentStyle, style, testId]);
};

SVGIcon.defaultProps = {
  fill: false,
  icon: null,
  source: null,
  style: null,
};

export default SVGIcon;
