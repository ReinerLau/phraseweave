// 通过 Satori 的在线调试工具 (https://og-playground.vercel.app/) 可以看到生成的图片效果
// 由于调试工具中，使用的是 jsx, 所以需要自己转换成以下格式（借助 GPT）会更方便转换
// 本模板使用了 tailwindcss，这是 Satori 的实验性功能

import type { ShareImageTemplateData } from "../share";

export const tpl_1 = ({ courseNum, totalRecordNumber, totalTime }: ShareImageTemplateData) => {
  return {
    type: "div",
    props: {
      tw: "w-full h-full bg-[#EEA2A4] px-8 pt-8 flex flex-col items-center tracking-normal font-sans",
      children: [
        {
          type: "div",
          props: {
            tw: "bg-white rounded-xl flex-1 w-full flex flex-col px-2 py-4 mb-6 shadow-xl",
            children: [
              {
                type: "span",
                props: {
                  tw: "text-slate-400 font-bold text-2xl",
                  children: `Course ${courseNum}`,
                },
              },
              {
                type: "div",
                props: {
                  tw: "text-slate-400 text-lg mb-6",
                  children: `恭喜您一共完成 ${totalRecordNumber} 道题，用时${totalTime}`,
                },
              },
            ],
          },
        },
        {
          type: "img",
          props: {
            src: "/logo.png",
            width: "48",
            height: "48",
            alt: "PhraseWeave logo",
          },
        },
        {
          type: "p",
          props: {
            tw: "text-lg mb-2",
            children: "© PhraseWeave",
          },
        },
      ],
    },
  };
};
