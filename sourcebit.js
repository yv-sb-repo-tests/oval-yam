const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

module.exports = {
  plugins: [
    {
      module: require('sourcebit-source-filesystem'),
      options: {
        watch: isDev,
        sources: [
          { name: 'pages', path: path.join(__dirname, 'content/pages') },
          { name: 'data', path: path.join(__dirname, 'content/data') }
        ]
      }
    },
    flattenMarkdownData(),
    resolveReferenceFields(),
    {
      module: require('sourcebit-target-next'),
      options: {
        liveUpdate: isDev,
        flattenAssetUrls: true,
        pages: (data) => {
          const pages = data.filter((page) => page.__metadata.sourceName === 'pages');
          const site = data.find((page) => page.__metadata.id === 'content/data/config.json');
          return pages.map((page) => {
            const path = urlFromFilepath(page.__metadata.relSourcePath);
            const meta = page.__metadata;
            delete page.__metadata;
            delete site.__metadata;
            return {
              path,
              site,
              meta,
              page
            };
          });
        }
      }
    }
  ]
};

function urlFromFilepath(filepath) {
  const fileParse = path.parse(filepath);
  const name = fileParse.name === 'index' ? '/' : fileParse.name;
  const url = path.join(fileParse.dir, name);
  return url;
}

function flattenMarkdownData() {
  return ({ data }) => {
    const objects = data.objects.map((object) => {
      if ('frontmatter' in object) {
        return {
          __metadata: object.__metadata,
          ...object.frontmatter,
          markdown_content: object.markdown || null
        };
      }
      return object;
    });

    return {
      ...data,
      objects
    };
  };
}

/**
 * Resolves reference fields to their data.
 * The references are naively resolved for field with a string value that
 * matches one of the object IDs.
 *
 * For example, if a post page has an author field referencing an author object:
 * {
 *   layout: 'post',
 *   title: '...',
 *   author: 'content/data/authors/john_doe.json'
 * }
 * Then the author's file path will be replaced with the author's data.
 *
 * @param {Object} options
 * @param {Array} options.fieldNames Names of fields to resolve. If left empty or not provided, all reference fields will be resolved.
 * @param {number} options.maxDepth Maximum depth of references to resolve. Default 2.
 */
function resolveReferenceFields({ fieldNames = [], maxDepth = 2 } = {}) {
  return ({ data }) => {
    const objectsByFilePath = data.objects.reduce((map, object) => {
      map[object.__metadata.id] = object;
      return map;
    }, {});

    const objects = data.objects.map((object) => {
      let refKeyPathStack = [];
      return mapDeep(object, (value, keyPath) => {
        if (fieldNames.length !== 0 && !fieldNames.includes(keyPath[keyPath.length - 1])) {
          return value;
        }
        if (typeof value !== 'string') {
          return value;
        }
        if (!/\.(?:md|mdx|json|yml|yaml|toml)$/.test(value)) {
          return value;
        }
        const keyPathStr = keyPath.join('.');
        while (refKeyPathStack.length && !keyPathStr.startsWith(refKeyPathStack[refKeyPathStack.length - 1])) {
          refKeyPathStack.pop();
        }
        if (refKeyPathStack.length > maxDepth) {
          return value;
        }
        if (keyPath.includes('__metadata')) {
          return value;
        }
        if (value in objectsByFilePath) {
          refKeyPathStack.push(keyPath.join('.'));
          const reference = objectsByFilePath[value];
          reference.url = urlFromFilepath(reference.__metadata.relSourcePath);
          return reference;
        }
        return value;
      });
    });

    return {
      ...data,
      objects
    };
  };
}

function mapDeep(value, iteratee, _keyPath = [], _objectStack = []) {
  value = iteratee(value, _keyPath, _objectStack);
  if (value && typeof value == 'object' && value.constructor === Object) {
    value = Object.entries(value).reduce((res, [key, val]) => {
      res[key] = mapDeep(val, iteratee, _keyPath.concat(key), _objectStack.concat(value));
      return res;
    }, {});
  } else if (Array.isArray(value)) {
    value = value.map((val, key) => mapDeep(val, iteratee, _keyPath.concat(key), _objectStack.concat(value)));
  }
  return value;
}
