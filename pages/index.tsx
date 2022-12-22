import { Inter } from '@next/font/google';
import styles from '../styles/Home.module.scss'; // use to name className by command style.<name>
import { WalletUI, useWalletUI } from '@algoscan/use-wallet-ui';
import algosdk, { encodeUnsignedTransaction } from 'algosdk';
import { Modal, Card } from 'antd';
import { useRef, useState } from 'react';
import NFTList from '../components/NFTList';

const inter = Inter({ subsets: ['latin'] }); // normally font of heading text (h1, h2, ...)

const { Meta } = Card;

const Home = () => {
  const { activeAddress, signTransactions } = useWalletUI();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [product, setProduct] = useState('');
  const productRef = useRef('');
  const assetsRef = useRef([]);

  const importAccount = () => {
    const account = algosdk.mnemonicToSecretKey(
      'segment enable urban basket problem relief rent flower power shrug differ advice lobster occur lawn exact agree blame worth version admit robust expose able cost',
    );
    console.log('private key', account.sk);
    return account;
  };

  const initClient = () => {
    const algodToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const algodServer = 'http://localhost';
    const algodPort = 4001;
    const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

    return algodClient;
  };

  const getListNFT = async (user: string) => {
    let algodClient = initClient();

    let info = await algodClient.accountInformation(user).do();
    const assets = info['assets'];
    // console.log(info);
    return assets;
  };

  const getBalance = async (user: string) => {
    let algodClient = await initClient();
    let info = await algodClient.accountInformation(user).do();
    const balance = info['amount'];
    // console.log(info);
    return balance;
  };

  const mintNFT = async () => {
    let myAccount = importAccount();
    let algodClient = initClient();

    let params = await algodClient.getTransactionParams().do();
    console.log(params);

    let txn = algosdk.makeAssetCreateTxnWithSuggestedParams(
      myAccount.addr,
      new Uint8Array(0),
      10,
      0,
      false,
      myAccount.addr,
      myAccount.addr,
      myAccount.addr,
      myAccount.addr,
      'HUY NFT',
      'HUY NFTS',
      // 'ipfs://',
      'https://news.artnet.com/app/news-upload/2022/06/94263c4219a6ae9b68fc8b127db10b8c.png',
      '',
      params,
    );

    let txId = txn.txID().toString();

    let signedTxn = txn.signTxn(myAccount.sk);
    console.log('Signed transaction with txID: %s', txId);

    // Submit the transaction
    await algodClient.sendRawTransaction(signedTxn).do();
    // Wait for transaction to be confirmed
    let confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 4);
    console.log(confirmedTxn);

    //Get the completed Transaction
    console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);
    // display results
    let transactionResponse = await algodClient.pendingTransactionInformation(txId).do();
    console.log('transactionResponse', transactionResponse);
    let assetId = transactionResponse['asset-index'];
    console.log('Created new asset-index: ', assetId);
    return assetId;
  };

  const handleConfirmModal = () => {
    setConfirmLoading(true);
    setTimeout(() => {
      setIsOpen(false);
      setConfirmLoading(false);
      setProduct(productRef.current);
    }, 2000);
  };

  const handleCancelModal = () => {
    setIsOpen(false);
    setProduct('');
  };

  const auctionProduct = async () => {
    let algodClient = initClient();
    if (activeAddress) {
      let assets = await getListNFT(activeAddress);
      assets = await Promise.all(
        assets.map(async (item: any, index: number) => {
          let image = await algodClient.getAssetByID(item['asset-id']).do();
          item = { ...item, image: image.params.url };
          return item;
        }),
      );
      assetsRef.current = assets;
      setIsOpen(true);
    }
  };

  const choosedProduct = (imageUrl: string) => {
    productRef.current = imageUrl;
  };

  return (
    <div className={styles.homePage}>
      <div className={styles.header}>
        <div className={styles.connectWalletArea}>
          <WalletUI primary="#c44dff" textColor="#FF0000" />
        </div>
      </div>
      <div className={styles.main}>
        <h1 className={(inter.className, styles.header)}>Auction Demo</h1>
        <div className={styles.dataContainer}>
          {!activeAddress ? (
            <h2 style={{ color: '#ffffff' }}>Please connect to your wallet</h2>
          ) : (
            <>
              <div className={styles.auctionProduct}>
                {product !== '' ? (
                  <Card
                    className={styles.product}
                    hoverable
                    cover={<img alt="" src={product} style={{ width: '100%', height: '100%' }} />}
                  >
                    <Meta title="test" className={styles.detailProduct} />
                  </Card>
                ) : null}
              </div>
              <div className={styles.btnArea}>
                <div className={styles.btnBid}>
                  <button onClick={() => getListNFT(activeAddress)}>Bid</button>
                </div>
                <div className={styles.btnSell}>
                  <button onClick={() => auctionProduct()}>Sell</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <Modal
        title="My NFTs"
        open={isOpen}
        onOk={handleConfirmModal}
        confirmLoading={confirmLoading}
        onCancel={handleCancelModal}
        style={{ top: '20%', zIndex: '9' }}
      >
        <NFTList nft={assetsRef.current} chooseProduct={choosedProduct} />
      </Modal>
    </div>
  );
};

export default Home;
