import { promptCategory } from '../../provider-utils/supportedPredictions';

const subcommand = 'update';

module.exports = {
  name: subcommand,
  alias: ['configure'],
  run: async context =>
    promptCategory()
      .then(result => {
        const providerController = require(`../../provider-utils/${result.provider}/index`);
        if (!providerController) {
          context.print.error('Provider not configured for this category');
          return undefined;
        }
        return providerController.updateResource(context, result.fileName);
      })
      .then(resourceName => {
        context.print.success(`Successfully updated resource ${resourceName} locally`);
      })
      .catch(err => {
        context.print.info(err.stack);
        context.print.error('An error occurred when updating predictions resource!');
        context.usageData.emitError(err);
        process.exitCode = 1;
      }),
};
