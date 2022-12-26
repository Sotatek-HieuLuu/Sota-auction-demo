import { Inter } from '@next/font/google';
import styles from '../styles/Home.module.scss'; // use to name className by command style.<name>
import { WalletUI, useWalletUI } from '@algoscan/use-wallet-ui';
import algosdk, { encodeUnsignedTransaction } from 'algosdk';
import { Modal, Card, InputNumber } from 'antd';
import { useRef, useState } from 'react';
import NFTList from '../components/NFTList';
import { createTransaction, createAuctionApp, setupAuctionApp, placeBid } from '../api/deployment';
import { initClient, getListNFT } from '../api/walletInteract';
import { useWallet } from '@txnlab/use-wallet';

const inter = Inter({ subsets: ['latin'] }); // normally font of heading text (h1, h2, ...)

const { Meta } = Card;

const Home = () => {
  const { activeAddress, signTransactions, sendTransactions } = useWallet();
  const [isOpenSell, setIsOpenSell] = useState(false);
  const [isOpenBid, setIsOpenBid] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [product, setProduct] = useState('');
  const productRef = useRef('');
  const assetsRef = useRef([]);
  const indexProductRef = useRef(-1);
  const bidAmountRef = useRef(-1);
  const appIdRef = useRef(0);

  const handleConfirmModalSell = async () => {
    setConfirmLoading(true);
    let algodClient = initClient();
    if (activeAddress) {
      let txn = await createTransaction(algodClient, activeAddress);
      const encodedTransaction = encodeUnsignedTransaction(txn);
      let appId = await createAuctionApp(txn, algodClient, signTransactions, sendTransactions, encodedTransaction);
      appIdRef.current = appId;
      let nftId = assetsRef.current[indexProductRef.current]['asset-id'];
      await setupAuctionApp(
        algodClient,
        activeAddress,
        signTransactions,
        sendTransactions,
        appId,
        nftId,
        1000,
        10,
      );

      setIsOpenSell(false);
      setConfirmLoading(false);
      setProduct(productRef.current);
    }
  };
  const handleConfirmModalBid = async () => {
    console.log('bidRef: ', bidAmountRef.current);
    setConfirmLoading(true);
    let algodClient = initClient();
    if (activeAddress && appIdRef) {
      await placeBid(
        algodClient,
        activeAddress,
        signTransactions,
        sendTransactions,
        appIdRef.current,
        bidAmountRef.current * 1000000,
      );
    }
    setConfirmLoading(false);
    setIsOpenBid(false);
  };

  const handleCancelModalSell = () => {
    setIsOpenSell(false);
    setProduct('');
  };
  const handleCancelModalBid = () => {
    setIsOpenBid(false);
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
      assets = assets.filter((item: any) => item.amount !== 0);
      console.log(assets);
      assetsRef.current = assets;
      setIsOpenSell(true);
    }
  };
  const bidProduct = () => {
    setIsOpenBid(true);
  };

  const choosedProduct = (imageUrl: string, idx: number) => {
    productRef.current = imageUrl;
    indexProductRef.current = idx;
  };

  const handleChangeBidAmount = (value: number | null) => {
    if (value) bidAmountRef.current = value;
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
                  <button onClick={() => bidProduct()}>Bid</button>
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
        open={isOpenSell}
        onOk={handleConfirmModalSell}
        confirmLoading={confirmLoading}
        onCancel={handleCancelModalSell}
        style={{ top: '20%', zIndex: '9' }}
      >
        <NFTList nft={assetsRef.current} chooseProduct={choosedProduct} />
      </Modal>
      <Modal
        title="Your Bid Amount"
        open={isOpenBid}
        onOk={handleConfirmModalBid}
        confirmLoading={confirmLoading}
        onCancel={handleCancelModalBid}
      >
        <InputNumber
          min={0.1}
          max={100}
          defaultValue={1}
          step={0.1}
          onChange={(value) => handleChangeBidAmount(value)}
        />
      </Modal>
    </div>
  );
};

export default Home;
