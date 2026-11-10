import { DefaultSeo } from "next-seo"
import { getBaseUrl } from "../lib/base_url"
import { APP_NAME, APP_TAGLINE } from "../lib/app_name"

export default function Meta() {
  return (
    <DefaultSeo
      titleTemplate={`%s - ${APP_NAME}`}
      defaultTitle={APP_NAME}
      description={APP_TAGLINE}
      canonical={`${getBaseUrl()}/`}
      openGraph={{
        type: "website",
        locale: "en_US",
        url: `${getBaseUrl()}/`,
        title: APP_NAME,
        description: APP_TAGLINE,
        siteName: APP_NAME,
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
    />
  )
}
