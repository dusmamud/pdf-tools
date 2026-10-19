import type { ToolDef } from '../tools';

const site = 'https://dusmamud.github.io/pdf-tools';

export function toolJsonLd(locale: string, tool: ToolDef, name: string, desc: string, url: string) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: `${name} — PDF Tools`,
      url,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'PDF Tools', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name, item: url },
      ],
    },
  ];
}

export function homeJsonLd(url: string) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'PDF Tools',
      url,
    },
  ];
}
