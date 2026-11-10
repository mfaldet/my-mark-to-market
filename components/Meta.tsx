import { DefaultSeo } from "next-seo"
import { getBaseUrl } from "../lib/base_url"

export default function Meta() {
  return (
    <DefaultSeo
      titleTemplate="%s - Fatebook"
      defaultTitle="Fatebook"
      description="Track your predictions, make better decisions."
      canonical={`${getBaseUrl()}/`}
      openGraph={{
        type: "website",
        locale: "en_US",
        url: `${getBaseUrl()}/`,
        title: "Fatebook",
        description: "Track your predictions, make better decisions.",
        siteName: "Fatebook",
        images: [
          {
            url: `${getBaseUrl()}/telescope_future_1200_white.png`,
            width: 1200,
            height: 686,
            alt: "",
          },
        ],
      }}
      additionalLinkTags={[
        {
          rel: "icon",
          href: `${getBaseUrl()}/scale.svg`,
        },
      ]}
      twitter={{
        handle: "@sage_future_",
      }}
    />
  )
}
