import { COMPILE_MODE_IDENTIFIER_PREFIX, indent, isFunction } from '@tarojs/shared';
import { RecursiveTemplate, Shortcuts } from '@tarojs/shared/dist/template';

interface ComponentConfig {
  includes: Set<string>;
  exclude: Set<string>;
  thirdPartyComponents: Map<string, Set<string>>;
  includeAll: boolean;
}

export class Template extends RecursiveTemplate {
  flattenViewLevel = 8;
  flattenCoverViewLevel = 8;
  flattenTextLevel = 3;
  supportXS = true;
  Adapter = {
    if: 'ks:if',
    else: 'ks:else',
    elseif: 'ks:elif',
    for: 'ks:for',
    forItem: 'ks:for-item',
    forIndex: 'ks:for-index',
    key: 'ks:key',
    type: 'kwai'
  };

  buildBaseTemplate() {
    const Adapter = this.Adapter;
    const data =
      !this.isSupportRecursive && this.supportXS
        ? `${this.dataKeymap(`i:item,c:1,l:xs.f('',item.${'nn' /* Shortcuts.NodeName */})`)}`
        : this.isSupportRecursive
        ? this.dataKeymap('i:item')
        : this.dataKeymap('i:item,c:1');
    const xs = this.supportXS
      ? this.isSupportRecursive
        ? `xs.a(0, item.${'nn' /* Shortcuts.NodeName */})`
        : `xs.a(0, item.${'nn' /* Shortcuts.NodeName */}, '')`
      : "'tmpl_0_' + item.nn";
    return `${this.buildXsTemplate()}
<template name="taro_tmpl">
<block ${Adapter.for}="{{root.cn}}" ${Adapter.key}="sid">
<template is="{{${xs}}}" data="{{${data}}}" />
</block>
</template>
`;
  }

  private getChildrenTemplate(level: number) {
    const { isSupportRecursive, isUseXS, Adapter, isUseCompileMode = true } = this;
    const isLastRecursiveComp = !isSupportRecursive && level + 1 === this.baseLevel;
    const isUnRecursiveXs = !this.isSupportRecursive && isUseXS;

    const forAttribute = `${Adapter.for}="{{i.${Shortcuts.Childnodes}}}" ${Adapter.key}="${Shortcuts.Sid}"`;
    if (isLastRecursiveComp) {
      const data = isUnRecursiveXs
        ? `${this.dataKeymap('i:item,c:c,l:l')}`
        : this.isSupportRecursive
        ? this.dataKeymap('i:item')
        : this.dataKeymap('i:item,c:c');

      return isUseXS
        ? `<template is="{{xs.e(${level})}}" data="{{${data}}}" ${forAttribute} />`
        : `<template is="tmpl_${level}_${Shortcuts.Container}" data="{{${data}}}" ${forAttribute} />`;
    } else {
      const data = isUnRecursiveXs
        ? // TODO: 此处直接 c+1，不是最优解，变量 c 的作用是监测组件嵌套的层级是否大于 baselevel
          // 但目前的监测方法用于所有组件嵌套的总和，应该分开组件计算，单个组件嵌套层级大于 baselevel 时，再进入 comp 组件中进行新的嵌套
          `${this.dataKeymap(`i:item,c:c+1,l:xs.f(l,item.${Shortcuts.NodeName})`)}`
        : this.isSupportRecursive
        ? `${this.dataKeymap('i:item')}`
        : `${this.dataKeymap('i:item,c:c+1')}`;

      const xs = !this.isSupportRecursive
        ? `xs.a(c, item.${Shortcuts.NodeName}, l)`
        : `xs.a(0, item.${Shortcuts.NodeName})`;

      return isUseXS
        ? `<template is="{{${xs}}}" data="{{${data}}}" ${forAttribute} />`
        : isSupportRecursive
        ? `<template is="{{'tmpl_0_' + item.${Shortcuts.NodeName}}}" data="{{${data}}}" ${forAttribute} />`
        : isUseCompileMode
        ? `<template is="{{'tmpl_' + (item.${Shortcuts.NodeName}[0]==='${COMPILE_MODE_IDENTIFIER_PREFIX}' ? 0 : c) + '_' + item.${Shortcuts.NodeName}}}" data="{{${data}}}" ${forAttribute} />`
        : `<template is="{{'tmpl_' + c + '_' + item.${Shortcuts.NodeName}}}" data="{{${data}}}" ${forAttribute} />`;
    }
  }

  getChildren(comp, level) {
    const { isSupportRecursive, Adapter } = this;
    const nextLevel = isSupportRecursive ? 0 : level + 1;
    let child = this.getChildrenTemplate(nextLevel);
    if (isFunction(this.modifyLoopBody)) {
      child = this.modifyLoopBody(child, comp.nodeName);
    }
    let children = this.voidElements.has(comp.nodeName)
      ? ''
      : `
<block ${Adapter.for}="{{i.${'cn' /* Shortcuts.Childnodes */}}}" ${Adapter.key}="sid">
	${indent(child, 6)}
</block>
`;
    if (isFunction(this.modifyLoopContainer)) {
      children = this.modifyLoopContainer(children, comp.nodeName);
    }
    return children;
  }

  protected buildThirdPartyTemplate(level: number, componentConfig: ComponentConfig) {
    const { isSupportRecursive, isUseXS, nestElements } = this;
    const nextLevel = isSupportRecursive ? 0 : level + 1;
    let template = '';

    componentConfig.thirdPartyComponents.forEach((attrs, compName) => {
      if (compName === 'custom-wrapper') {
        template += `
<template name="tmpl_${level}_${compName}">
  <${compName} i="{{i}}" ${
          !isSupportRecursive && isUseXS ? 'l="{{l}}"' : ''
        } id="{{i.uid||i.sid}}" data-sid="{{i.sid}}">
  </${compName}>
</template>
  `;
      } else {
        if (
          !isSupportRecursive &&
          isUseXS &&
          nestElements.has(compName) &&
          level + 1 > nestElements.get(compName)!
        )
          return;

        let child = this.getChildrenTemplate(nextLevel);

        if (isFunction(this.modifyThirdPartyLoopBody)) {
          child = this.modifyThirdPartyLoopBody(child, compName);
        }

        const children = this.voidElements.has(compName)
          ? ''
          : `
    ${child}
  `;

        template += `
<template name="tmpl_${level}_${compName}">
  <${compName} ${this.buildThirdPartyAttr(
          attrs,
          this.thirdPartyPatcher[compName] || {}
        )} id="{{i.uid||i.sid}}" data-sid="{{i.sid}}">${children}</${compName}>
</template>
  `;
      }
    });

    return template;
  }

  createMiniComponents(components): any {
    const result = super.createMiniComponents(components);

    delete result['pure-view'];
    delete result['static-view'];

    return result;
  }

  buildXsTemplate() {
    return '<ks module="xs" src="./utils.ks" />';
  }
}
