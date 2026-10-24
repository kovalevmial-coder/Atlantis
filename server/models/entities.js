// Описание сущностей конструктора: по нему строятся списки и формы панели директора,
// поэтому новые точки, продукты, льготы и т.п. добавляются без правки кода.
// Типы полей: text, textarea, number, money, int, bool, color, select, lines (список строк), image, slug
module.exports = {
  branches: {
    table: 'branches', title: 'Точки', one: 'точку', icon: 'map', order: 'name',
    fields: [
      { name: 'name', label: 'Название', type: 'text', required: true, max: 120 },
      { name: 'address', label: 'Адрес', type: 'text', required: true },
      { name: 'phone', label: 'Телефон', type: 'text', max: 40 },
      { name: 'hours', label: 'Часы работы', type: 'text', max: 120 },
      { name: 'is_active', label: 'Работает', type: 'bool', default: true }
    ],
    list: ['name', 'address', 'phone', 'is_active']
  },
  rooms: {
    table: 'rooms', title: 'Кабинеты', one: 'кабинет', icon: 'school', order: 'branch_id, name', branchField: 'branch_id',
    fields: [
      { name: 'branch_id', label: 'Точка', type: 'select', ref: { table: 'branches', label: 'name' }, required: true },
      { name: 'name', label: 'Название', type: 'text', required: true, max: 60 },
      { name: 'capacity', label: 'Вместимость', type: 'int', required: true, min: 1, default: 10 },
      { name: 'is_active', label: 'Используется', type: 'bool', default: true }
    ],
    list: ['branch_id', 'name', 'capacity', 'is_active']
  },
  categories: {
    table: 'categories', title: 'Категории направлений', one: 'категорию', icon: 'book', order: 'sort', textKey: true,
    fields: [
      { name: 'id', label: 'Код (латиницей)', type: 'slug', required: true, max: 30 },
      { name: 'title', label: 'Название', type: 'text', required: true, max: 60 },
      { name: 'sort', label: 'Порядок', type: 'int', default: 0 }
    ],
    list: ['id', 'title', 'sort']
  },
  products: {
    table: 'products', title: 'Продукты и направления', one: 'продукт', icon: 'star', order: 'sort, title',
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, max: 120 },
      { name: 'slug', label: 'Адрес на сайте (латиницей)', type: 'slug', required: true, max: 60 },
      { name: 'code', label: 'Метка в расписании', type: 'text', required: true, max: 12, hint: 'Короткое обозначение, например «КАЛ» или «АНГЛ»' },
      { name: 'color', label: 'Цвет в расписании', type: 'color', default: '#469E3E' },
      { name: 'category_id', label: 'Категория', type: 'select', ref: { table: 'categories', label: 'title', key: 'id' }, required: true },
      { name: 'short', label: 'Краткое описание', type: 'text', max: 255 },
      { name: 'program', label: 'Программа (по строке на пункт)', type: 'lines' },
      { name: 'for_whom', label: 'Кому подходит (по строке на пункт)', type: 'lines' },
      { name: 'age_label', label: 'Возраст для сайта', type: 'text', max: 40, hint: 'Например «5–6 лет» или «1 класс»' },
      { name: 'age_from', label: 'Возраст от, лет', type: 'int', min: 1, max: 18 },
      { name: 'age_to', label: 'Возраст до, лет', type: 'int', min: 1, max: 18 },
      { name: 'duration_min', label: 'Длительность занятия, мин', type: 'int', required: true, min: 1, default: 60 },
      { name: 'duration_label', label: 'Длительность для сайта', type: 'text', max: 60 },
      { name: 'group_label', label: 'Размер группы для сайта', type: 'text', max: 40 },
      { name: 'price', label: 'Цена одного занятия, руб.', type: 'money', required: true },
      { name: 'price_label', label: 'Цена на витрине, руб.', type: 'money', hint: 'Если цена указывается за курс' },
      { name: 'price_unit', label: 'Единица цены', type: 'text', max: 60, default: 'за занятие' },
      { name: 'link', label: 'Отдельная страница (ссылка)', type: 'text', max: 255 },
      { name: 'image_id', label: 'Картинка', type: 'image' },
      { name: 'is_online', label: 'Онлайн-курс', type: 'bool' },
      { name: 'featured', label: 'Показывать на главной', type: 'bool' },
      { name: 'show_on_site', label: 'Показывать на сайте', type: 'bool', default: true },
      { name: 'sort', label: 'Порядок', type: 'int', default: 0 },
      { name: 'is_active', label: 'Активен', type: 'bool', default: true }
    ],
    list: ['title', 'code', 'color', 'age_label', 'price', 'show_on_site', 'is_active']
  },
  benefits: {
    table: 'benefits', title: 'Льготы', one: 'льготу', icon: 'heart', order: 'title',
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, max: 120 },
      { name: 'discount_pct', label: 'Скидка, %', type: 'money', required: true, min: 0, max: 100 },
      { name: 'is_active', label: 'Действует', type: 'bool', default: true }
    ],
    list: ['title', 'discount_pct', 'is_active']
  },
  price_cards: {
    table: 'price_cards', title: 'Карточки цен', one: 'карточку цены', icon: 'wallet', order: 'sort, id',
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text', required: true, max: 120 },
      { name: 'value', label: 'Цена, руб.', type: 'money', required: true },
      { name: 'unit', label: 'Подпись к цене', type: 'text', required: true, max: 60 },
      { name: 'note', label: 'Примечание', type: 'text', max: 255 },
      { name: 'items', label: 'Что входит (по строке)', type: 'lines' },
      { name: 'featured', label: 'Выделить', type: 'bool' },
      { name: 'sort', label: 'Порядок', type: 'int', default: 0 }
    ],
    list: ['title', 'value', 'unit', 'featured']
  },
  reviews: {
    table: 'reviews', title: 'Отзывы', one: 'отзыв', icon: 'chat', order: 'sort, id',
    fields: [
      { name: 'text', label: 'Текст', type: 'textarea', required: true, max: 1000 },
      { name: 'author', label: 'Автор', type: 'text', required: true, max: 120 },
      { name: 'about', label: 'О чём', type: 'text', max: 160 },
      { name: 'source', label: 'Источник', type: 'text', max: 60 },
      { name: 'sort', label: 'Порядок', type: 'int', default: 0 }
    ],
    list: ['author', 'about', 'source']
  },
  faq: {
    table: 'faq', title: 'Вопросы и ответы', one: 'вопрос', icon: 'info', order: 'sort, id',
    fields: [
      { name: 'q', label: 'Вопрос', type: 'text', required: true },
      { name: 'a', label: 'Ответ', type: 'textarea', required: true, max: 1000 },
      { name: 'sort', label: 'Порядок', type: 'int', default: 0 }
    ],
    list: ['q', 'sort']
  }
};
