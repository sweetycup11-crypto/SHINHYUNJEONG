// 카드 뒷면 디자인 목록과 가격
// 가격을 바꾸면 supabase/schema.sql 의 shop_price() 도 같은 값으로 바꾸고 SQL을 다시 실행하세요.
// 디자인 모양은 style.css 의 [data-back="…"] 에 있습니다.
export const CARD_BACKS = [
  { id: 'default', name: '기본 줄무늬', price: 0 },
  { id: 'dots', name: '물방울', price: 50 },
  { id: 'check', name: '체크무늬', price: 80 },
  { id: 'waves', name: '파도', price: 100 },
  { id: 'sunset', name: '노을', price: 120 },
  { id: 'honeycomb', name: '벌집 분자', price: 150 },
  { id: 'stars', name: '별밤', price: 200 },
  { id: 'rainbow', name: '무지개', price: 250 },
  { id: 'galaxy', name: '은하수', price: 300 },
  { id: 'gold', name: '황금 카드', price: 500 },
];
export const priceOf = (id) => CARD_BACKS.find((b) => b.id === id)?.price;
